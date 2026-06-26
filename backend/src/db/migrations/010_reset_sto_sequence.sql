-- Migration 010: Reset sto_number_seq past existing STO IDs
-- The sequence was created starting at 1 but records may already exist.
-- This finds the current max and restarts the sequence one above it.
-- Safe to run multiple times — RESTART WITH is idempotent.

DECLARE @max_num INT;

SELECT @max_num = ISNULL(MAX(CAST(RIGHT(sto_id, 5) AS INT)), 0)
FROM sto_requests
WHERE sto_id LIKE 'STO-[0-9][0-9][0-9][0-9]-%';

DECLARE @next INT = @max_num + 1;
DECLARE @sql NVARCHAR(200) = N'ALTER SEQUENCE sto_number_seq RESTART WITH ' + CAST(@next AS NVARCHAR(10));
EXEC sp_executesql @sql;
