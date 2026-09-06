-- Phase 8: payment verification + print order foundation
ALTER TABLE payments ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_payments_application_created ON payments(application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_print_orders_payment_status ON print_orders(payment_status, print_status, created_at DESC);
