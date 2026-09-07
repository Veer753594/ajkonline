# Backend — Phase 8: Payment + Print Order Foundation

## Migration order
1. `sql/001_initial_schema.sql`
2. `sql/002_seed_services.sql`
3. `sql/003_auth_hardening.sql`
4. `sql/004_application_tracking.sql`
5. `sql/005_documents_review.sql`
6. `sql/006_payment_print_orders.sql`

## Payment APIs
- `POST /api/payments` — create a payment for an application or print order. For print orders the server uses the stored order amount; the browser cannot choose the amount.
- `GET /api/payments` — ADMIN / ACCOUNT_MANAGER payment queue.
- `PATCH /api/payments/:id/verify` — ADMIN / ACCOUNT_MANAGER marks SUCCESS or FAILED. Successful print-order payments automatically set `payment_status=VERIFIED` and `print_status=QUEUED`.

Supported payment methods:
- `UPI` — transaction/reference ID required; remains PENDING until staff verification.
- `CASH` — remains PENDING until staff verification.
- `GATEWAY` — reserved for a real gateway adapter; currently returns PROCESSING and must not be treated as paid.

## Print-order APIs
Public customer endpoints:
- `POST /api/print-orders/available-documents` — validates Service Number + Token Number and returns document metadata only.
- `POST /api/print-orders` — creates a print order only when the selected document is APPROVED.
- `POST /api/print-orders/status` — returns the customer's print/payment status without exposing the document bytes.

Protected staff endpoints:
- `GET /api/print-orders` — print queue.
- `PATCH /api/print-orders/:id/status` — update CREATED / QUEUED / PRINTING / PRINTED / CANCELLED / FAILED.

## Pricing foundation
- B&W document / photocopy: ₹5 × copies
- Color document: ₹10 × copies
- Color Photo Print: ₹100 × copies

This is the Phase 8 order-level pricing foundation. Page-count-aware billing, gateway webhooks, receipts/GST logic, browser print handoff and Windows AutoPrint Agent are intentionally separate milestones.

## Security notes
- Payment amount for a print order is calculated on the server from stored order settings.
- A print order cannot be created from an unapproved document.
- A print order is not queued until a staff member verifies payment as SUCCESS.
- No public document-download endpoint is exposed.


### Phase 9
- `POST /api/print-orders/:id/prepare-print` — ADMIN/ACCOUNT_MANAGER only; requires VERIFIED payment and returns an authenticated print URL.
- `GET /api/documents/:id/print` — ADMIN/ACCOUNT_MANAGER only; streams an approved document inline with no-store headers.
- `PATCH /api/print-orders/:id/status` records printed timestamp/user when status becomes PRINTED.


## Supabase Storage
- Customer documents are stored in the private Supabase Storage bucket configured by `SUPABASE_STORAGE_BUCKET` (default: `documents`).
- Set `SUPABASE_URL` and the **server-only** `SUPABASE_SECRET_KEY` on the backend host.
- Never expose `SUPABASE_SECRET_KEY` in frontend code, GitHub, Netlify environment variables, or browser requests.
- The backend continues to enforce the 10 MB per-file and 5-file upload limits.
- Document print/download routes retrieve files through the backend; the bucket remains private.
