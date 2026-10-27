-- Add a service-specific label for each uploaded document. Existing rows remain valid.
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS document_label VARCHAR(160);
