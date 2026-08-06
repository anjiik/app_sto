-- Migration 015: STO attachments (e.g. Certificate of Analysis)
-- Any signed-in user can attach a file (PDF/image, <=10MB) to an STO at any
-- point in the workflow. Stored as VARBINARY(MAX) in the row for simplicity —
-- no filesystem path or backup plan to manage separately.
-- Run AFTER 014_sto_number_request.sql.

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
