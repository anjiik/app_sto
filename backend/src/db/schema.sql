-- Run this script once against your SQL Server database
-- 1. Create the database first: CREATE DATABASE sto_management;
-- 2. Then run this script against it.

CREATE TABLE sto_requests (
    id                              INT PRIMARY KEY IDENTITY(1,1),
    sto_id                          VARCHAR(50) UNIQUE,

    request_date                    DATE NOT NULL,
    standard_estimated_ship_date    DATE,
    expedited_estimated_ship_date   DATE,
    repeat_shipment_calendar_year   VARCHAR(10),
    rush_request                    BIT DEFAULT 0,
    priority                        TINYINT,
    public_holiday                  BIT DEFAULT 0,

    requesting_plant                VARCHAR(100),
    shipping_site                   VARCHAR(100),
    receiving_site                  VARCHAR(100),
    toll_mfg                        BIT DEFAULT 0,

    requestor_user_id               INT NOT NULL,
    requestor_name                  VARCHAR(200),
    requestor_email                 VARCHAR(200),

    material_sap                    VARCHAR(100),
    material_description            VARCHAR(500),
    mpn_number                      VARCHAR(100),
    quantity                        DECIMAL(18,4),
    uom                             VARCHAR(50),
    batch_number                    VARCHAR(100),
    expiration_date                 DATE,
    container_information           VARCHAR(500),
    shipping_conditions             VARCHAR(500),
    controlled_shipping_required    BIT DEFAULT 0,
    controlled_shipping_notes       NVARCHAR(1000),
    brand_at_receiving_site         VARCHAR(200),

    material_value                  DECIMAL(18,2),
    freight_cost                    DECIMAL(18,2),
    insurance_loss_required         BIT DEFAULT 0,

    rush_reason                     NVARCHAR(MAX),
    receiving_site_need_by_date     DATE,
    estimated_ship_by_date          DATE,

    management_approval_required    BIT DEFAULT 0,
    mgmt_confirmed                  BIT DEFAULT 0,

    planning_approved               BIT,
    planning_approved_by_user_id    INT,
    planning_approved_at            DATETIME,
    planning_notes                  NVARCHAR(MAX),

    management_approved             BIT,
    management_approved_by_user_id  INT,
    management_approved_at          DATETIME,
    management_notes                NVARCHAR(MAX),

    finance_approved                BIT,
    finance_approved_by_user_id     INT,
    finance_approved_at             DATETIME,
    finance_notes                   NVARCHAR(MAX),

    sto_number                      VARCHAR(100),
    shipment_id                     VARCHAR(100),
    ready_to_ship                   BIT,
    pgi_date                        DATE,
    actual_ship_date                DATE,
    tracking_id                     VARCHAR(200),
    actual_receipt_date             DATE,
    delivery_closed_out             BIT DEFAULT 0,
    corporate_sto_tracker_status    VARCHAR(100),

    inco_terms                      VARCHAR(100),
    estimated_delivery_date         DATE,
    igb_complete                    BIT DEFAULT 0,

    status                          VARCHAR(50) DEFAULT 'DRAFT',
    rejection_reason                NVARCHAR(MAX),
    created_at                      DATETIME DEFAULT GETDATE(),
    updated_at                      DATETIME DEFAULT GETDATE()
);

CREATE TABLE sto_audit_log (
    id              INT PRIMARY KEY IDENTITY(1,1),
    sto_request_id  INT NOT NULL,
    action          VARCHAR(100) NOT NULL,
    old_status      VARCHAR(50),
    new_status      VARCHAR(50),
    performed_by    INT NOT NULL,
    performed_by_name VARCHAR(200),
    notes           NVARCHAR(MAX),
    performed_at    DATETIME DEFAULT GETDATE()
);

CREATE TABLE sto_config (
    config_key      VARCHAR(100) PRIMARY KEY,
    config_value    VARCHAR(500) NOT NULL,
    updated_at      DATETIME DEFAULT GETDATE()
);

INSERT INTO sto_config (config_key, config_value) VALUES
    ('management_approval_material_threshold', '10000'),
    ('management_approval_freight_threshold',  '5000');

-- Demo users table — used for local development / testing.
-- In production this table is bypassed; authentication comes from Active Directory via LDAP.
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='demo_users' AND xtype='U')
CREATE TABLE demo_users (
    id           INT PRIMARY KEY IDENTITY(1,1),
    username     VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(200) NOT NULL,
    display_name VARCHAR(200) NOT NULL,
    site         VARCHAR(20)  NOT NULL,   -- e.g. ABC, ABL, XYZ (legacy; primary/first site)
    group_key    VARCHAR(50)  NOT NULL,   -- legacy single role: receiving_site, etc.
    -- Multi-role support: semicolon-separated `role@site` grants, e.g.
    -- "shipping_logistics@ABC;receiving_logistics@ABC;shipping_planning@ABL".
    -- When NULL/blank, login falls back to group_key expanded across `site`.
    grants       VARCHAR(500) NULL
);

-- ── Referential integrity ──────────────────────────────────────────────────────
ALTER TABLE sto_audit_log
  ADD CONSTRAINT FK_audit_sto_request
  FOREIGN KEY (sto_request_id) REFERENCES sto_requests(id);

-- ── Atomic STO ID generation ──────────────────────────────────────────────────
-- Using a SEQUENCE avoids the COUNT(*)+1 race condition that occurs when two
-- concurrent inserts read the same row count and try to write the same sto_id.
CREATE SEQUENCE sto_number_seq
  START WITH 1
  INCREMENT BY 1
  NO CYCLE;

-- ── Indexes ───────────────────────────────────────────────────────────────────
-- Without these every WHERE clause does a full table scan.
-- Composite indexes are ordered by selectivity: most-selective column first.

-- Status is the most common filter across every queue and list query.
CREATE NONCLUSTERED INDEX IX_sto_status
  ON sto_requests (status)
  INCLUDE (created_at, updated_at, rush_request, receiving_site_need_by_date);

-- Shipping-role queue: shipping_planning and shipping_logistics filter by
-- (shipping_site, status).  Covers all their dashboard and list queries.
CREATE NONCLUSTERED INDEX IX_sto_shipping_site_status
  ON sto_requests (shipping_site, status)
  INCLUDE (sto_id, priority, rush_request, material_description, material_sap,
           quantity, uom, receiving_site_need_by_date, updated_at);

-- Receiving-role queue: same pattern for receiving side.
CREATE NONCLUSTERED INDEX IX_sto_receiving_site_status
  ON sto_requests (receiving_site, status)
  INCLUDE (sto_id, priority, rush_request, material_description, material_sap,
           quantity, uom, receiving_site_need_by_date, updated_at);

-- Need-by date queries (due-soon, overdue, upcoming section).
-- Filtered: only indexes the rows that actually have a date set.
CREATE NONCLUSTERED INDEX IX_sto_need_by_status
  ON sto_requests (receiving_site_need_by_date, status)
  WHERE receiving_site_need_by_date IS NOT NULL;

-- Default list sort order.
CREATE NONCLUSTERED INDEX IX_sto_created_at
  ON sto_requests (created_at DESC);

-- Analytics monthly grouping.
CREATE NONCLUSTERED INDEX IX_sto_request_date
  ON sto_requests (request_date)
  INCLUDE (status, material_value, rush_request, shipping_site, receiving_site);

-- Audit log: JOIN target and ordering.
CREATE NONCLUSTERED INDEX IX_audit_sto_request_id
  ON sto_audit_log (sto_request_id);

CREATE NONCLUSTERED INDEX IX_audit_performed_at
  ON sto_audit_log (performed_at DESC)
  INCLUDE (action, old_status, new_status, performed_by_name, notes);

-- ── App users + sites ─────────────────────────────────────────────────────────
-- sites: master list of valid site codes (e.g. ABC, ABL, XYZ).
CREATE TABLE sites (
    id    INT PRIMARY KEY IDENTITY(1,1),
    code  VARCHAR(50)  UNIQUE NOT NULL,
    name  VARCHAR(200) NOT NULL
);

INSERT INTO sites (code, name) VALUES
    ('ABC', 'Site ABC'),
    ('ABL', 'Site ABL'),
    ('XYZ', 'Site XYZ');

-- app_users: source of truth for roles and site assignments.
-- AD only proves identity; roles/sites live here.
-- New users are auto-created as receiving_site on first login and must pick
-- their site via the setup-site page.  Admins can change any field.
CREATE TABLE app_users (
    id            INT          PRIMARY KEY IDENTITY(1,1),
    ad_username   VARCHAR(200) NOT NULL,
    display_name  VARCHAR(200) NOT NULL,
    email         VARCHAR(200) NULL,
    site          VARCHAR(50)  NULL,           -- NULL until user completes setup
    app_group     VARCHAR(50)  NOT NULL DEFAULT 'receiving_site',
    is_active     BIT          NOT NULL DEFAULT 1,
    created_at    DATETIME     DEFAULT GETDATE(),
    updated_at    DATETIME     DEFAULT GETDATE()
);

CREATE UNIQUE INDEX UQ_app_users_username ON app_users (ad_username);

-- ── To promote the first admin (run after your first login) ───────────────────
-- UPDATE app_users SET app_group = 'admin' WHERE ad_username = 'firstname.lastname@company.com';
