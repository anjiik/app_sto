import Database from 'better-sqlite3';
import path from 'path';

const db = new Database(path.join(__dirname, '../../sto.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS sto_requests (
    id                              INTEGER PRIMARY KEY AUTOINCREMENT,
    sto_id                          TEXT UNIQUE,
    request_date                    TEXT NOT NULL,
    standard_estimated_ship_date    TEXT,
    expedited_estimated_ship_date   TEXT,
    repeat_shipment_calendar_year   TEXT,
    rush_request                    INTEGER DEFAULT 0,
    priority                        INTEGER,
    public_holiday                  INTEGER DEFAULT 0,
    requesting_plant                TEXT,
    shipping_site                   TEXT,
    receiving_site                  TEXT,
    toll_mfg                        INTEGER DEFAULT 0,
    requestor_user_id               INTEGER NOT NULL,
    requestor_name                  TEXT,
    requestor_email                 TEXT,
    material_sap                    TEXT,
    material_description            TEXT,
    mpn_number                      TEXT,
    quantity                        REAL,
    uom                             TEXT,
    batch_number                    TEXT,
    expiration_date                 TEXT,
    container_information           TEXT,
    shipping_conditions             TEXT,
    controlled_shipping_required    INTEGER DEFAULT 0,
    brand_at_receiving_site         TEXT,
    material_value                  REAL,
    freight_cost                    REAL,
    insurance_loss_required         INTEGER DEFAULT 0,
    rush_reason                     TEXT,
    receiving_site_need_by_date     TEXT,
    estimated_ship_by_date          TEXT,
    management_approval_required    INTEGER DEFAULT 0,
    planning_approved               INTEGER,
    planning_approved_by_user_id    INTEGER,
    planning_approved_at            TEXT,
    planning_notes                  TEXT,
    management_approved             INTEGER,
    management_approved_by_user_id  INTEGER,
    management_approved_at          TEXT,
    management_notes                TEXT,
    finance_approved                INTEGER,
    finance_approved_by_user_id     INTEGER,
    finance_approved_at             TEXT,
    finance_notes                   TEXT,
    sto_number                      TEXT,
    shipment_id                     TEXT,
    ready_to_ship                   INTEGER,
    pgi_date                        TEXT,
    actual_ship_date                TEXT,
    tracking_id                     TEXT,
    actual_receipt_date             TEXT,
    delivery_closed_out             INTEGER DEFAULT 0,
    corporate_sto_tracker_status    TEXT,
    inco_terms                      TEXT,
    estimated_delivery_date         TEXT,
    igb_complete                    INTEGER DEFAULT 0,
    status                          TEXT DEFAULT 'DRAFT',
    rejection_reason                TEXT,
    created_at                      TEXT DEFAULT (datetime('now')),
    updated_at                      TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sto_audit_log (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    sto_request_id    INTEGER NOT NULL,
    action            TEXT NOT NULL,
    old_status        TEXT,
    new_status        TEXT,
    performed_by      INTEGER NOT NULL,
    performed_by_name TEXT,
    notes             TEXT,
    performed_at      TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sto_config (
    config_key    TEXT PRIMARY KEY,
    config_value  TEXT NOT NULL,
    updated_at    TEXT DEFAULT (datetime('now'))
  );

  INSERT OR IGNORE INTO sto_config (config_key, config_value) VALUES ('management_approval_material_threshold', '10000');
  INSERT OR IGNORE INTO sto_config (config_key, config_value) VALUES ('management_approval_freight_threshold', '5000');
`);

// Safe migrations for columns added after initial schema
for (const col of [
  'ALTER TABLE sto_requests ADD COLUMN inco_terms TEXT',
  'ALTER TABLE sto_requests ADD COLUMN estimated_delivery_date TEXT',
  'ALTER TABLE sto_requests ADD COLUMN igb_complete INTEGER DEFAULT 0',
]) {
  try { db.exec(col); } catch { /* column already exists */ }
}

export default db;
