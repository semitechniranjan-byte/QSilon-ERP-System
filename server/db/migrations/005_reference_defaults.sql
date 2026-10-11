-- 005: editable default reference data (no school-specific amounts, people or passwords).
INSERT INTO boards (code, name) VALUES ('CBSE','Central Board of Secondary Education'), ('BSEB','Bihar School Examination Board') ON CONFLICT DO NOTHING;
INSERT INTO mediums (code, name) VALUES ('EN','English'), ('HI','Hindi') ON CONFLICT DO NOTHING;

INSERT INTO class_levels (name, name_hi, code, sort_order, is_preschool) VALUES
 ('Playgroup','प्ले ग्रुप','PG',1,true), ('Nursery','नर्सरी','NUR',2,true), ('LKG','एल.के.जी.','LKG',3,true), ('UKG','यू.के.जी.','UKG',4,true),
 ('Class 1','कक्षा 1','1',11,false), ('Class 2','कक्षा 2','2',12,false), ('Class 3','कक्षा 3','3',13,false), ('Class 4','कक्षा 4','4',14,false),
 ('Class 5','कक्षा 5','5',15,false), ('Class 6','कक्षा 6','6',16,false), ('Class 7','कक्षा 7','7',17,false), ('Class 8','कक्षा 8','8',18,false),
 ('Class 9','कक्षा 9','9',19,false), ('Class 10','कक्षा 10','10',20,false), ('Class 11','कक्षा 11','11',21,false), ('Class 12','कक्षा 12','12',22,false)
ON CONFLICT DO NOTHING;

INSERT INTO fee_categories (code, name, name_hi, kind, default_frequency) VALUES
 ('ADMISSION','Admission Fee','प्रवेश शुल्क','admission','one_time'),
 ('TUITION','Tuition Fee','शिक्षण शुल्क','tuition','monthly'),
 ('PRESCHOOL','Preschool Course Fee','प्री-स्कूल पाठ्यक्रम शुल्क','preschool_course','monthly'),
 ('ANNUAL','Annual Fee','वार्षिक शुल्क','annual','annual'),
 ('EXAM','Examination Fee','परीक्षा शुल्क','exam','half_yearly'),
 ('HOSTEL','Hostel Charges','छात्रावास शुल्क','hostel','monthly'),
 ('MESS','Hostel Mess Charges','भोजनालय शुल्क','hostel','monthly'),
 ('TRANSPORT','Transport Charges','परिवहन शुल्क','transport','monthly'),
 ('UNIFORM','Uniform / Dress','पोशाक शुल्क','uniform','one_time'),
 ('BOOKS','Books & Stationery','पुस्तकें एवं लेखन सामग्री','books','annual')
ON CONFLICT DO NOTHING;

INSERT INTO grading_scales (name, is_default) VALUES ('Standard (A1–E)', true) ON CONFLICT DO NOTHING;
INSERT INTO grading_bands (scale_id, min_percent, grade, grade_point, remark)
SELECT s.id, b.minp, b.grade, b.gp, b.remark FROM grading_scales s,
 (VALUES (91,'A1',10,'Outstanding'),(81,'A2',9,'Excellent'),(71,'B1',8,'Very Good'),(61,'B2',7,'Good'),
         (51,'C1',6,'Above Average'),(41,'C2',5,'Average'),(33,'D',4,'Pass'),(0,'E',0,'Needs Improvement')) AS b(minp,grade,gp,remark)
WHERE s.name = 'Standard (A1–E)' ON CONFLICT DO NOTHING;

INSERT INTO assessment_domains (name, name_hi, sort_order) VALUES
 ('Language & Communication','भाषा एवं संवाद',1), ('Numeracy','संख्या ज्ञान',2), ('Motor Skills','शारीरिक कौशल',3),
 ('Social & Emotional','सामाजिक एवं भावनात्मक',4), ('Creativity (Art & Music)','रचनात्मकता',5), ('General Awareness','सामान्य जागरूकता',6)
ON CONFLICT DO NOTHING;

INSERT INTO public_pages (key, title, title_hi, body) VALUES
 ('about','About Us','हमारे बारे में',''), ('academics','Academics','शैक्षणिक',''), ('preschool','Preschool','प्री-स्कूल',''),
 ('hostel','Hostel','छात्रावास',''), ('facilities','Facilities','सुविधाएँ',''), ('transport','Transport','परिवहन',''),
 ('admissions','Admissions','प्रवेश',''), ('contact','Contact Us','संपर्क करें','')
ON CONFLICT DO NOTHING;
