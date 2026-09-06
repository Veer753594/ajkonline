-- Phase 9: browser print handoff audit fields
ALTER TABLE print_orders ADD COLUMN IF NOT EXISTS print_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE print_orders ADD COLUMN IF NOT EXISTS last_print_attempt_at TIMESTAMPTZ;
ALTER TABLE print_orders ADD COLUMN IF NOT EXISTS printed_at TIMESTAMPTZ;
ALTER TABLE print_orders ADD COLUMN IF NOT EXISTS printed_by UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_print_orders_queue_attempt ON print_orders(print_status, last_print_attempt_at DESC);
