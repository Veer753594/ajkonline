# Service document requirements — review draft

This is a review worksheet only. It does not change the database.

## Keep file upload optional / no document upload by default
- mobile-recharge — Mobile recharge: collect the mobile number and operator/plan details in a dedicated service form; do not ask for document uploads.
- fastag-recharge — FASTag recharge: collect the vehicle/FASTag identifier and amount in a dedicated service form; do not ask for document uploads.
- card-lamination — Card lamination: collect the card image/scan only if the customer needs to provide it; confirm at the centre.
- a4-lamination — A4 lamination: collect the document file only if required for the order; confirm at the centre.
- result-check — Result check: needs exam/board, roll number, and passing year or exam session in a dedicated form; document upload usually is not the right input.
- photo-document-printing — Keep the existing print workflow unchanged. Do not make a Service Number or Token Number a prerequisite before an application is submitted.

## Replace generic “आवश्यक दस्तावेज” only after confirming the exact service and current requirements
The following services currently have a generic placeholder in the catalog:
- fssai-registration
- gst-new-registration
- gst-return-filing
- gst-amendment
- udyam-msme-registration
- trade-license-application
- trademark-application
- dsc-assistance
- shop-establishment-registration
- up-scholarship-application
- web-registration
- government-job-application
- driving-licence
- passport-application
- voter-id
- worker-registration

Before setting mandatory document names, confirm the specific application type, applicant category, and current official checklist. Do not treat this draft as legal or official guidance.

## Services whose document lists are empty and need a workflow decision
- banking-assistance
- pan-services
- education-forms
- caste-certificate
- income-certificate
- residence-certificate
- online-form-filling
- transport-services

For each, decide whether the service needs named file inputs, structured form fields, or no upload at all. Do not force uploads for services that only need information.

## Approval checklist
1. Confirm each service's actual workflow.
2. Confirm exact requirements against the current official portal/checklist where applicable.
3. Only then prepare a separate SQL migration for the approved entries.
4. Test one new application per service group and verify the Admin document labels.
