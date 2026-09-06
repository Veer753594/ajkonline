CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO service_categories (name, slug, status) VALUES
  ('Government', 'government', 'ACTIVE'),
  ('Documents', 'documents', 'ACTIVE'),
  ('Online Services', 'online-services', 'ACTIVE'),
  ('Education', 'education', 'ACTIVE'),
  ('Banking', 'banking', 'ACTIVE'),
  ('Printing', 'printing', 'ACTIVE'),
  ('Other', 'other', 'ACTIVE')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO services (category_id, name, slug, description, base_price, status)
SELECT c.id, v.name, v.slug, v.description, v.price, 'ACTIVE'
FROM (VALUES
  ('government', 'Income Certificate', 'income-certificate', 'Income certificate application assistance.', 50::numeric),
  ('government', 'Caste Certificate', 'caste-certificate', 'Caste certificate application assistance.', 50::numeric),
  ('government', 'Residence Certificate', 'residence-certificate', 'Residence certificate application assistance.', 50::numeric),
  ('documents', 'PAN Services', 'pan-services', 'PAN application and related assistance.', 110::numeric),
  ('online-services', 'Online Form Filling', 'online-form-filling', 'Online application and form filling service.', 30::numeric),
  ('education', 'Education Forms', 'education-forms', 'Education, admission and examination form assistance.', 30::numeric),
  ('banking', 'Banking Assistance', 'banking-assistance', 'General digital banking assistance.', 0::numeric),
  ('printing', 'Photo & Document Printing', 'photo-document-printing', 'Photo and document printing service.', 5::numeric),
  ('other', 'Transport Services', 'transport-services', 'Transport-related online service assistance.', 0::numeric)
) AS v(category_slug, name, slug, description, price)
JOIN service_categories c ON c.slug = v.category_slug
ON CONFLICT (slug) DO UPDATE SET
  category_id = EXCLUDED.category_id,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  base_price = EXCLUDED.base_price,
  status = EXCLUDED.status,
  updated_at = NOW();
