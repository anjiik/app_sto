-- Run this script once against your SQL Server database
-- 1. Create the database first: CREATE DATABASE sto_management;
-- 2. Then run this script against it.
--
-- This is the FRESH-INSTALL path only — it reflects the fully-migrated
-- schema (equivalent to running every file in migrations/ 001-018 in order
-- against an empty database). An EXISTING database should keep applying
-- migrations/*.sql in order instead of re-running this file.
--
-- IMPORTANT for maintainers: whenever a new migration is added to
-- migrations/, apply the same change here too, so this file never drifts
-- from the migrated state again. Drift here has caused two classes of bug
-- before: a fresh install missing a column/table a migration had added (e.g.
-- archived/archived_at, receiving_mgmt_*), and a fresh install having the
-- WRONG constraint on a column a migration had altered (e.g.
-- requestor_user_id and sto_audit_log.performed_by were left NOT NULL here
-- after migration 006 made them nullable — the app never populates either,
-- so every insert failed on a fresh install until that was caught and fixed).
-- Check migrations for ALTER COLUMN, not just ADD, when reconciling.

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
    distressed_inventory            BIT DEFAULT 0,
    di_value                        DECIMAL(18,2),

    -- Nullable: there is no app_users table (removed — roles/identity come
    -- from AD or demo_users, see routes/sto.ts POST /, which always inserts
    -- NULL here). The requestor is identified by requestor_name/email instead.
    requestor_user_id               INT NULL,
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

    receiving_mgmt_approved             BIT,
    receiving_mgmt_approved_by_user_id  INT,
    receiving_mgmt_approved_at          DATETIME,
    receiving_mgmt_notes                NVARCHAR(1000),

    -- finance_* is retired (the finance role no longer exists — see
    -- receiving_management above) but kept for old-row compatibility rather
    -- than dropping columns; no live code reads/writes these.
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
    sto_number_requested_at         DATETIME,

    inco_terms                      VARCHAR(100),
    estimated_delivery_date         DATE,
    igb_complete                    BIT DEFAULT 0,

    status                          VARCHAR(50) DEFAULT 'DRAFT',
    rejection_reason                NVARCHAR(MAX),
    created_at                      DATETIME DEFAULT GETDATE(),
    updated_at                      DATETIME DEFAULT GETDATE(),

    -- Soft-archive: CLOSED/REJECTED rows older than the retention window are
    -- flagged archived=1 by the admin archive job and excluded from every
    -- normal query (every list/analytics route filters archived = 0).
    archived                        BIT NOT NULL DEFAULT 0,
    archived_at                     DATETIME NULL
);

CREATE TABLE sto_audit_log (
    id              INT PRIMARY KEY IDENTITY(1,1),
    sto_request_id  INT NOT NULL,
    action          VARCHAR(100) NOT NULL,
    old_status      VARCHAR(50),
    new_status      VARCHAR(50),
    -- Nullable: there is no app_users table to reference an integer user id
    -- against. Every write identifies the actor via performed_by_name instead
    -- (see db/audit.ts logAudit, which never populates this column).
    performed_by    INT NULL,
    performed_by_name VARCHAR(200),
    notes           NVARCHAR(MAX),
    performed_at    DATETIME DEFAULT GETDATE()
);

CREATE TABLE sto_config (
    config_key      VARCHAR(100) PRIMARY KEY,
    config_value    VARCHAR(500) NOT NULL,
    updated_at      DATETIME DEFAULT GETDATE()
);

-- Attachments (e.g. Certificate of Analysis) — any signed-in user may add one to
-- any STO at any point in the workflow. File bytes are stored in the row.
CREATE TABLE sto_attachments (
    id              INT PRIMARY KEY IDENTITY(1,1),
    sto_request_id  INT NOT NULL,
    file_name       VARCHAR(255) NOT NULL,
    content_type    VARCHAR(100) NOT NULL,
    file_size       INT NOT NULL,
    category        VARCHAR(50) NOT NULL DEFAULT 'Other',
    file_data       VARBINARY(MAX) NOT NULL,
    uploaded_by     VARCHAR(200) NOT NULL,
    uploaded_at     DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_sto_attachments_sto FOREIGN KEY (sto_request_id)
        REFERENCES sto_requests(id)
);

CREATE NONCLUSTERED INDEX IX_sto_attachments_sto
  ON sto_attachments (sto_request_id, uploaded_at DESC);

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
    site         VARCHAR(20)  NOT NULL,   -- e.g. ABC, ABL, ABS (legacy; primary/first site)
    group_key    VARCHAR(50)  NOT NULL,   -- legacy single role: shipping_planning, etc.
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

-- The archived = 0 predicate is applied by nearly every query — see above.
CREATE NONCLUSTERED INDEX IX_sto_requests_archived
  ON sto_requests (archived);

-- ── App users + sites ─────────────────────────────────────────────────────────
-- sites: master list of valid site codes (e.g. ABC, ABL, ABS).
CREATE TABLE sites (
    id    INT PRIMARY KEY IDENTITY(1,1),
    code  VARCHAR(50)  UNIQUE NOT NULL,
    name  VARCHAR(200) NOT NULL
);

INSERT INTO sites (code, name) VALUES
    ('ABC', 'Site ABC'),
    ('ABL', 'Site ABL'),
    ('ABS', 'Site ABS'),
    ('MBM', 'Site MBM');

-- ── Migration tracking ──────────────────────────────────────────────────────
-- A fresh install from this file already reflects everything through
-- migration 018 (018_backfill_migration_history.sql backfills this table's
-- history rows on both fresh and pre-existing databases — run it once after
-- this script). Do NOT run migrations 001-018 by hand against a database
-- created from this file; they are already applied here.
CREATE TABLE schema_migrations (
    filename    VARCHAR(200) PRIMARY KEY,
    applied_at  DATETIME NOT NULL DEFAULT GETDATE()
);
