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
    brand_at_receiving_site         VARCHAR(200),

    material_value                  DECIMAL(18,2),
    freight_cost                    DECIMAL(18,2),
    insurance_loss_required         BIT DEFAULT 0,

    rush_reason                     NVARCHAR(MAX),
    receiving_site_need_by_date     DATE,
    estimated_ship_by_date          DATE,

    management_approval_required    BIT DEFAULT 0,

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
-- In production this table is bypassed; authentication comes from PingFederate/AD.
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='demo_users' AND xtype='U')
CREATE TABLE demo_users (
    id           INT PRIMARY KEY IDENTITY(1,1),
    username     VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(200) NOT NULL,
    display_name VARCHAR(200) NOT NULL,
    site         VARCHAR(20)  NOT NULL,   -- e.g. ABC, ABL, XYZ
    group_key    VARCHAR(50)  NOT NULL    -- matches Group type: receiving_site, etc.
);
