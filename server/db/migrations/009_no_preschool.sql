-- 009: the school runs Nursery to Class 12 (day scholars and hostellers). There is no separate preschool section:
-- Nursery is treated as a regular class (marks, school fee plans), and Playgroup, LKG and UKG are deactivated
-- (not deleted) so they disappear from the website, forms and reports. Re-activate under Classes & Sections → Class levels.
UPDATE class_levels SET is_preschool = false, is_active = true WHERE code = 'NUR'
   AND NOT EXISTS (SELECT 1 FROM fee_plans p WHERE p.class_level_id = class_levels.id AND p.plan_type = 'preschool');
UPDATE class_levels cl SET is_active = false
 WHERE cl.code IN ('PG', 'LKG', 'UKG')
   AND NOT EXISTS (SELECT 1 FROM enrollments e JOIN students s ON s.id = e.student_id
                    WHERE e.class_level_id = cl.id AND e.status = 'active' AND NOT s.is_demo);

-- Default website text (only where it is still the original default wording).
UPDATE school_settings SET about = replace(about, 'from Playgroup to Class 12', 'from Nursery to Class 12')
 WHERE id = 1 AND about LIKE '%from Playgroup to Class 12%';
UPDATE public_pages SET body = 'Admissions are open from Nursery to Class 12 for day scholars and hostel residents. Fill the enquiry form below and the school office will contact you to schedule a visit and interaction.'
 WHERE key = 'admissions' AND body LIKE 'Admissions are open for Playgroup to Class 12.%';
UPDATE public_pages SET body = 'Classes from Nursery to Class 12 follow a structured curriculum with regular unit tests, term examinations and continuous assessment. Smart classrooms, laboratories and a library support hands-on learning.

Day scholars attend school from 9:00 AM to 4:00 PM and go home; hostel residents stay on campus with supervised study hours.

Students receive report cards each term with subject-wise marks, grades and teacher remarks.'
 WHERE key = 'academics' AND body LIKE 'Classes 1 to 12 follow a structured curriculum%';
