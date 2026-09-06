CREATE INDEX IF NOT EXISTS idx_applications_status_created ON applications(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_status_history_application_created ON status_history(application_id, created_at ASC);
