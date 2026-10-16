-- AJK Service Catalog expansion (safe to run more than once).
-- Existing services are preserved; matching slugs are updated in place.
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS price_label VARCHAR(80),
  ADD COLUMN IF NOT EXISTS pricing_confirmed BOOLEAN NOT NULL DEFAULT TRUE;

INSERT INTO service_categories (name, slug, status) VALUES
  ('Certificates & Ration', 'certificates-ration', 'ACTIVE'),
  ('Farmer & Land Services', 'farmer-land', 'ACTIVE'),
  ('Pension & Welfare', 'pension-welfare', 'ACTIVE'),
  ('Education, Exams & Jobs', 'education-exams-jobs', 'ACTIVE'),
  ('Identity & Transport', 'identity-transport', 'ACTIVE'),
  ('Bills & Recharge', 'bills-recharge', 'ACTIVE'),
  ('Digital, Printing & Typing', 'digital-printing-typing', 'ACTIVE'),
  ('Design Services', 'design-services', 'ACTIVE'),
  ('Business Registration', 'business-registration', 'ACTIVE')
ON CONFLICT (slug) DO NOTHING;

WITH catalog(category_slug, name, slug, description, price, price_label, pricing_confirmed, docs) AS (
  VALUES
  ('certificates-ration','EWS प्रमाण पत्र','ews-certificate','EWS प्रमाण पत्र आवेदन सहायता',100::numeric,'₹100',TRUE,'["आधार कार्ड","प्रधान सत्यापन"]'::jsonb),
  ('certificates-ration','नया राशन कार्ड आवेदन','new-ration-card','नया राशन कार्ड आवेदन सहायता',150::numeric,'₹150',TRUE,'["सभी मेम्बर्स के आधार कार्ड","मुखिया का पासबुक","आय प्रमाण","फोटो"]'::jsonb),
  ('certificates-ration','राशन कार्ड संशोधन','ration-card-correction','राशन कार्ड संशोधन सहायता',100::numeric,'₹100',TRUE,'["सभी मेम्बर्स के आधार कार्ड","मुखिया का पासबुक","आय प्रमाण","फोटो"]'::jsonb),
  ('farmer-land','PM-KISAN पंजीकरण','pm-kisan-registration','PM-KISAN पंजीकरण सहायता',0::numeric,'रेट जल्द निर्धारित होगा',FALSE,'["आधार कार्ड","खतौनी"]'::jsonb),
  ('farmer-land','PM-KISAN स्टेटस','pm-kisan-status','PM-KISAN स्टेटस जाँच',0::numeric,'रेट जल्द निर्धारित होगा',FALSE,'["आधार कार्ड"]'::jsonb),
  ('farmer-land','किसान क्रेडिट कार्ड (KCC) आवेदन','kcc-application','KCC आवेदन सहायता',0::numeric,'रेट जल्द निर्धारित होगा',FALSE,'["आधार कार्ड","खतौनी"]'::jsonb),
  ('farmer-land','भूलेख / खसरा / खतौनी','land-records','भूलेख, खसरा और खतौनी निकालना',20::numeric,'₹20',TRUE,'["गाटा संख्या, नाम और पिता का नाम लिखा हुआ कागज"]'::jsonb),
  ('farmer-land','भू-नक्शा','land-map','भू-नक्शा निकालना',20::numeric,'₹20',TRUE,'["गाटा संख्या, नाम और पिता का नाम लिखा हुआ कागज"]'::jsonb),
  ('pension-welfare','वृद्धावस्था पेंशन आवेदन','old-age-pension','वृद्धावस्था पेंशन आवेदन सहायता',100::numeric,'₹100',TRUE,'["आधार कार्ड","आय प्रमाण","पासबुक","फोटो"]'::jsonb),
  ('pension-welfare','विधवा / निराश्रित महिला पेंशन','widow-pension','विधवा / निराश्रित महिला पेंशन आवेदन सहायता',100::numeric,'₹100',TRUE,'["आधार कार्ड","आय प्रमाण","मृत्यु प्रमाणपत्र","पासबुक","फोटो"]'::jsonb),
  ('pension-welfare','दिव्यांगजन पेंशन आवेदन','disability-pension','दिव्यांगजन पेंशन आवेदन सहायता',100::numeric,'₹100',TRUE,'["आधार कार्ड","आय प्रमाण","विकलांग प्रमाणपत्र","पासबुक","फोटो"]'::jsonb),
  ('pension-welfare','पारिवारिक लाभ योजना आवेदन','family-benefit-scheme','पारिवारिक लाभ योजना आवेदन सहायता',100::numeric,'₹100',TRUE,'["आधार कार्ड","आय प्रमाण","मृत्यु प्रमाणपत्र","पासबुक","फोटो"]'::jsonb),
  ('pension-welfare','श्रमिक पंजीकरण','worker-registration','श्रमिक पंजीकरण सहायता',100::numeric,'₹100',TRUE,'["आवश्यक दस्तावेज"]'::jsonb),
  ('pension-welfare','जनसुनवाई एवं शिकायत निवारण आवेदन','public-grievance','जनसुनवाई एवं शिकायत निवारण आवेदन',100::numeric,'₹100',TRUE,'["शिकायत, नाम और पिता का नाम लिखा हुआ कागज"]'::jsonb),
  ('education-exams-jobs','UP Scholarship आवेदन','up-scholarship-application','UP Scholarship आवेदन सहायता',150::numeric,'₹150',TRUE,'["आवश्यक दस्तावेज"]'::jsonb),
  ('education-exams-jobs','छात्रवृत्ति स्टेटस','scholarship-status','छात्रवृत्ति स्टेटस जाँच',20::numeric,'₹20',TRUE,'["रजिस्ट्रेशन नंबर, पासवर्ड और OTR नंबर लिखा हुआ कागज"]'::jsonb),
  ('education-exams-jobs','UP Board रिजल्ट','up-board-result','UP Board रिजल्ट जाँच',20::numeric,'₹20',TRUE,'["रोल नंबर और पासिंग वर्ष लिखा हुआ कागज"]'::jsonb),
  ('education-exams-jobs','वेब रेजिस्ट्रैशन','web-registration','वेब रेजिस्ट्रैशन सहायता',500::numeric,'₹500',TRUE,'["आवश्यक दस्तावेज"]'::jsonb),
  ('education-exams-jobs','सरकारी नौकरी आवेदन','government-job-application','सरकारी नौकरी आवेदन सहायता',100::numeric,'₹100',TRUE,'["आवश्यक दस्तावेज"]'::jsonb),
  ('education-exams-jobs','एडमिट कार्ड डाउनलोड','admit-card-download','एडमिट कार्ड डाउनलोड',10::numeric,'₹10',TRUE,'["रजिस्ट्रेशन नंबर और जन्मतिथि लिखा हुआ कागज"]'::jsonb),
  ('education-exams-jobs','रिजल्ट','result-check','ऑनलाइन रिजल्ट जाँच',0::numeric,'रेट जल्द निर्धारित होगा',FALSE,'[]'::jsonb),
  ('identity-transport','Voter ID','voter-id','Voter ID आवेदन सहायता',150::numeric,'₹150',TRUE,'["आवश्यक दस्तावेज"]'::jsonb),
  ('identity-transport','Passport','passport-application','Passport आवेदन सहायता',3000::numeric,'₹3000',TRUE,'["आवश्यक दस्तावेज"]'::jsonb),
  ('identity-transport','Driving Licence','driving-licence','Driving Licence आवेदन सहायता',0::numeric,'रेट जल्द निर्धारित होगा',FALSE,'["आवश्यक दस्तावेज"]'::jsonb),
  ('bills-recharge','बिजली बिल जमा','electricity-bill-payment','बिजली बिल जमा सहायता',20::numeric,'₹20',TRUE,'["Consumer A/c Number"]'::jsonb),
  ('bills-recharge','मोबाइल रिचार्ज','mobile-recharge','मोबाइल रिचार्ज सहायता',0::numeric,'रेट जल्द निर्धारित होगा',FALSE,'[]'::jsonb),
  ('bills-recharge','FASTag रिचार्ज','fastag-recharge','FASTag रिचार्ज सहायता',0::numeric,'रेट जल्द निर्धारित होगा',FALSE,'[]'::jsonb),
  ('digital-printing-typing','पासपोर्ट साइज फोटो','passport-size-photo','पासपोर्ट साइज फोटो सेवा',30::numeric,'₹30',TRUE,'["फोटो"]'::jsonb),
  ('digital-printing-typing','PDF बनाना','make-pdf','दस्तावेजों से PDF बनाना',2::numeric,'₹2/पेज',TRUE,'["दस्तावेज"]'::jsonb),
  ('digital-printing-typing','डॉक्यूमेंट ईमेल करना','email-document','डॉक्यूमेंट ईमेल करना',50::numeric,'₹50',TRUE,'["ईमेल एड्रेस","दस्तावेज"]'::jsonb),
  ('digital-printing-typing','हिंदी टाइपिंग','hindi-typing','हिंदी टाइपिंग सेवा',100::numeric,'₹100/पेज',TRUE,'["टाइपिंग के लिए मैटर"]'::jsonb),
  ('digital-printing-typing','अंग्रेजी टाइपिंग','english-typing','अंग्रेजी टाइपिंग सेवा',80::numeric,'₹80/पेज',TRUE,'["टाइपिंग के लिए मैटर"]'::jsonb),
  ('digital-printing-typing','रिज्यूमे / बायोडाटा','resume-cv','रिज्यूमे / बायोडाटा बनाना',100::numeric,'₹100',TRUE,'["रिज्यूमे के लिए मैटर और जानकारी"]'::jsonb),
  ('digital-printing-typing','Excel में डेटा एंट्री','excel-data-entry','Excel में डेटा एंट्री सेवा',4::numeric,'₹4/एंट्री',TRUE,'["डेटा"]'::jsonb),
  ('digital-printing-typing','कार्ड लैमिनेशन','card-lamination','कार्ड लैमिनेशन सेवा',10::numeric,'₹10/कार्ड',TRUE,'[]'::jsonb),
  ('digital-printing-typing','A4 लैमिनेशन','a4-lamination','A4 लैमिनेशन सेवा',20::numeric,'₹20/A4',TRUE,'[]'::jsonb),
  ('design-services','डिजिटल शादी कार्ड','digital-wedding-card','डिजिटल शादी कार्ड डिजाइन',0::numeric,'रेट जल्द निर्धारित होगा',FALSE,'["कार्ड के लिए नाम, तारीख और विवरण"]'::jsonb),
  ('design-services','सगाई कार्ड','engagement-card','सगाई कार्ड डिजाइन',0::numeric,'रेट जल्द निर्धारित होगा',FALSE,'["कार्ड के लिए नाम, तारीख और विवरण"]'::jsonb),
  ('design-services','जन्मदिन निमंत्रण कार्ड','birthday-invitation-card','जन्मदिन निमंत्रण कार्ड डिजाइन',0::numeric,'रेट जल्द निर्धारित होगा',FALSE,'["नाम, तारीख और कार्यक्रम का विवरण"]'::jsonb),
  ('design-services','दुकान का बोर्ड डिजाइन','shop-board-design','दुकान के बोर्ड का डिजाइन',0::numeric,'रेट जल्द निर्धारित होगा',FALSE,'["दुकान का नाम, आकार और संपर्क विवरण"]'::jsonb),
  ('design-services','पोस्टर डिजाइन','poster-design','पोस्टर डिजाइन सेवा',0::numeric,'रेट जल्द निर्धारित होगा',FALSE,'["पोस्टर का टेक्स्ट और डिजाइन विवरण"]'::jsonb),
  ('design-services','विजिटिंग कार्ड डिजाइन','visiting-card-design','विजिटिंग कार्ड डिजाइन',0::numeric,'रेट जल्द निर्धारित होगा',FALSE,'["नाम, पद, संपर्क और पता"]'::jsonb),
  ('design-services','लोगो डिजाइन','logo-design','लोगो डिजाइन सेवा',0::numeric,'रेट जल्द निर्धारित होगा',FALSE,'["ब्रांड/दुकान का नाम और डिजाइन विवरण"]'::jsonb),
  ('design-services','लेटरहेड डिजाइन','letterhead-design','लेटरहेड डिजाइन सेवा',0::numeric,'रेट जल्द निर्धारित होगा',FALSE,'["नाम, पता, लोगो और संपर्क विवरण"]'::jsonb),
  ('design-services','स्कूल ID कार्ड डिजाइन','school-id-card-design','स्कूल ID कार्ड डिजाइन',0::numeric,'रेट जल्द निर्धारित होगा',FALSE,'["स्कूल विवरण और फोटो/नाम की सूची"]'::jsonb),
  ('design-services','कर्मचारी ID कार्ड','employee-id-card','कर्मचारी ID कार्ड डिजाइन',0::numeric,'रेट जल्द निर्धारित होगा',FALSE,'["कर्मचारी नाम, फोटो और संस्था विवरण"]'::jsonb),
  ('design-services','मेन्यू कार्ड','menu-card-design','मेन्यू कार्ड डिजाइन',0::numeric,'रेट जल्द निर्धारित होगा',FALSE,'["मेन्यू आइटम, कीमतें और दुकान विवरण"]'::jsonb),
  ('design-services','त्योहारों के शुभकामना पोस्टर','festival-greeting-poster','त्योहारों के शुभकामना पोस्टर डिजाइन',0::numeric,'रेट जल्द निर्धारित होगा',FALSE,'["शुभकामना टेक्स्ट और नाम/लोगो"]'::jsonb),
  ('design-services','राजनीतिक / प्रचार पोस्टर','political-campaign-poster','राजनीतिक / प्रचार पोस्टर डिजाइन',0::numeric,'रेट जल्द निर्धारित होगा',FALSE,'["पोस्टर का टेक्स्ट और प्रचार विवरण"]'::jsonb),
  ('business-registration','GST नया रजिस्ट्रेशन','gst-new-registration','GST नया रजिस्ट्रेशन सहायता',0::numeric,'रेट जल्द निर्धारित होगा',FALSE,'["आवश्यक दस्तावेज"]'::jsonb),
  ('business-registration','GST संशोधन','gst-amendment','GST संशोधन सहायता',0::numeric,'रेट जल्द निर्धारित होगा',FALSE,'["आवश्यक दस्तावेज"]'::jsonb),
  ('business-registration','GST रिटर्न फाइलिंग सहायता','gst-return-filing','GST रिटर्न फाइलिंग सहायता',0::numeric,'रेट जल्द निर्धारित होगा',FALSE,'["आवश्यक दस्तावेज"]'::jsonb),
  ('business-registration','Udyam / MSME रजिस्ट्रेशन','udyam-msme-registration','Udyam / MSME रजिस्ट्रेशन सहायता',0::numeric,'रेट जल्द निर्धारित होगा',FALSE,'["आवश्यक दस्तावेज"]'::jsonb),
  ('business-registration','FSSAI रजिस्ट्रेशन आवेदन सहायता','fssai-registration','FSSAI रजिस्ट्रेशन आवेदन सहायता',0::numeric,'रेट जल्द निर्धारित होगा',FALSE,'["आवश्यक दस्तावेज"]'::jsonb),
  ('business-registration','दुकान एवं प्रतिष्ठान पंजीकरण सहायता','shop-establishment-registration','दुकान एवं प्रतिष्ठान पंजीकरण सहायता',0::numeric,'रेट जल्द निर्धारित होगा',FALSE,'["आवश्यक दस्तावेज"]'::jsonb),
  ('business-registration','ट्रेड लाइसेंस आवेदन सहायता','trade-license-application','ट्रेड लाइसेंस आवेदन सहायता',0::numeric,'रेट जल्द निर्धारित होगा',FALSE,'["आवश्यक दस्तावेज"]'::jsonb),
  ('business-registration','डिजिटल सिग्नेचर सर्टिफिकेट (DSC) सहायता','dsc-assistance','डिजिटल सिग्नेचर सर्टिफिकेट (DSC) सहायता',0::numeric,'रेट जल्द निर्धारित होगा',FALSE,'["आवश्यक दस्तावेज"]'::jsonb),
  ('business-registration','ट्रेडमार्क आवेदन सहायता','trademark-application','ट्रेडमार्क आवेदन सहायता',0::numeric,'रेट जल्द निर्धारित होगा',FALSE,'["आवश्यक दस्तावेज"]'::jsonb)
)
INSERT INTO services (category_id, name, slug, description, base_price, price_label, pricing_confirmed, required_documents, status)
SELECT c.id, v.name, v.slug, v.description, v.price, v.price_label, v.pricing_confirmed, v.docs, 'ACTIVE'
FROM catalog v
JOIN service_categories c ON c.slug = v.category_slug
ON CONFLICT (slug) DO UPDATE SET
  category_id = EXCLUDED.category_id,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  base_price = EXCLUDED.base_price,
  price_label = EXCLUDED.price_label,
  pricing_confirmed = EXCLUDED.pricing_confirmed,
  required_documents = EXCLUDED.required_documents,
  status = 'ACTIVE',
  updated_at = NOW();
