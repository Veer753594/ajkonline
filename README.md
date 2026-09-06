# Ayush Janseva Kendra — Phase 9

Phase 9 adds the payment-verification and print-order foundation on top of Phase 7.

## What is included
- Customer print-order workflow using Service Number + Token Number
- Only ADMIN/ACCOUNT_MANAGER-approved documents can become print orders
- Print settings: Photo State / Photo Print / Document Print, B&W/Color, copies, duplex, paper size
- Server-side print pricing foundation:
  - B&W: ₹5 per copy
  - Color document: ₹10 per copy
  - Color Photo Print: ₹100 per copy
- Payment records for UPI, Cash at Centre and a reserved Gateway method
- UPI transaction/reference ID capture
- Admin/Account Manager payment verification
- Successful verified payment automatically moves the print order to `QUEUED`
- Admin/Account Manager print queue with print-status controls
- Public print-order status polling for the customer

## Important production note
The live payment gateway is intentionally **not activated** in Phase 9 because gateway credentials/configuration have not yet been supplied. `GATEWAY` is a reserved integration path and does not fake a successful payment.

Browser auto-print is also **not falsely marked complete** here. After payment verification, the order is safely placed in the print queue. The next milestone will implement the browser print handoff and then the Windows AutoPrint Agent.

## Backend migrations
Run in order:
1. `sql/001_initial_schema.sql`
2. `sql/002_seed_services.sql`
3. `sql/003_auth_hardening.sql`
4. `sql/004_application_tracking.sql`
5. `sql/005_documents_review.sql`
6. `sql/006_payment_print_orders.sql`

## Architecture
The static website can be hosted on Netlify, while this Node.js/PostgreSQL API must be deployed on a backend-capable service. Set the frontend `window.API_BASE` to the deployed API URL and configure backend `CORS_ORIGIN` accordingly.

Do not commit `.env`, passwords, gateway secrets, uploaded documents, or API tokens.


## Phase 9 — Browser Print Handoff
After a payment is verified, the management portal can place the print order into PRINTING and open the authenticated document in a new browser window. The portal then attempts to open the browser print dialog. Browsers do not permit guaranteed silent printing; a Print Now fallback is provided.

Run SQL migrations in order through `007_browser_print_handoff.sql`.

## Phase 9.1 — Connectivity and Login Fix
- Added one-place frontend API configuration in `assets/js/config.js`.
- Fixed the frontend/admin login response handling to match the backend `{ ok, data: { token, user } }` response.
- Fixed `/auth/me` response handling.
- Application/document actions are blocked with a clear message when the API is not connected instead of sending demo catalogue IDs to a real backend.
- Document upload accepts valid PDF/JPG/JPEG/PNG files based on extension and then verifies actual file signatures (magic bytes), avoiding false rejection from browser MIME metadata.
- Added `/api/ping` for simple frontend/backend connectivity testing.
