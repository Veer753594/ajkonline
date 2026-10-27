-- AJK service catalogue audit (read-only; safe to run in Supabase SQL Editor).
-- Reports service counts and services whose document requirements need review.
SELECT
  c.name AS category,
  COUNT(*) AS active_services
FROM services s
JOIN service_categories c ON c.id = s.category_id
WHERE s.status = 'ACTIVE' AND c.status = 'ACTIVE'
GROUP BY c.name
ORDER BY c.name;

SELECT
  s.id,
  s.name,
  s.slug,
  c.name AS category,
  s.price_label,
  s.pricing_confirmed,
  s.required_documents
FROM services s
JOIN service_categories c ON c.id = s.category_id
WHERE s.status = 'ACTIVE'
  AND c.status = 'ACTIVE'
  AND (
    s.required_documents IS NULL
    OR s.required_documents = '[]'::jsonb
    OR s.required_documents = '["आवश्यक दस्तावेज"]'::jsonb
  )
ORDER BY c.name, s.name;

SELECT
  COUNT(*) FILTER (WHERE pricing_confirmed = FALSE) AS services_with_unconfirmed_pricing,
  COUNT(*) FILTER (
    WHERE required_documents IS NULL
       OR required_documents = '[]'::jsonb
       OR required_documents = '["आवश्यक दस्तावेज"]'::jsonb
  ) AS services_needing_document_review,
  COUNT(*) AS active_services
FROM services
WHERE status = 'ACTIVE';
