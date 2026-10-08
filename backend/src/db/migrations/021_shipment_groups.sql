-- Migration 021: Combined freight cost across multiple STOs (shipment groups)
--
-- A handful of STOs can physically ship on the same pallet/consignment and
-- share one combined carrier freight invoice. sto_shipment_groups holds that
-- one combined_freight_cost; sto_requests.shipment_group_id links a member
-- STO to its group (NULL = not grouped, the common case). The group's
-- combined material value (used for the management-approval threshold/ratio
-- check) is computed on the fly — SUM(material_value) across non-rejected
-- members — rather than stored, so there's no separate "recompute on reject"
-- step to keep in sync.
--
-- Safe to re-run: guarded by IF NOT EXISTS.

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'sto_shipment_groups')
  CREATE TABLE sto_shipment_groups (
    id                      INT IDENTITY PRIMARY KEY,
    combined_freight_cost   DECIMAL(18,2) NOT NULL,
    created_at              DATETIME DEFAULT GETDATE(),
    created_by              NVARCHAR(200)
  );

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'sto_requests' AND COLUMN_NAME = 'shipment_group_id'
)
  ALTER TABLE sto_requests ADD shipment_group_id INT NULL REFERENCES sto_shipment_groups(id);

IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE filename = '021_shipment_groups.sql')
  INSERT INTO schema_migrations (filename) VALUES ('021_shipment_groups.sql');
