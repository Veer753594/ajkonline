-- Phase 5: authentication/authorization support.
-- Users already exist in 001_initial_schema.sql; this migration adds safe lookup indexes.
CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role, status);
CREATE INDEX IF NOT EXISTS idx_users_mobile_lower ON users(LOWER(mobile));
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users(LOWER(email));
