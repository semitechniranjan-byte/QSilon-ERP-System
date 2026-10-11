-- 007: school identity and default public website content (only fills values that are still empty/default).
UPDATE school_settings SET name = 'Future Creations Public School', name_hi = coalesce(name_hi, 'फ्यूचर क्रिएशन्स पब्लिक स्कूल')
 WHERE id = 1 AND name IN ('School Management System', 'Demo Public School');
UPDATE school_settings SET
  tagline = coalesce(tagline, 'Nurturing curious minds for a creative future'),
  tagline_hi = coalesce(tagline_hi, 'रचनात्मक भविष्य के लिए जिज्ञासु मन का पोषण'),
  about = coalesce(about, 'Future Creations Public School offers a joyful, safe and disciplined learning environment from Playgroup to Class 12. Our experienced teachers combine strong academics with sports, arts and values so that every child grows with confidence.

We follow the CBSE and BSEB curricula in English and Hindi medium, with day-school and residential (hostel) options and safe school transport.'),
  about_hi = coalesce(about_hi, 'फ्यूचर क्रिएशन्स पब्लिक स्कूल प्ले ग्रुप से कक्षा 12 तक आनंदमय, सुरक्षित और अनुशासित शिक्षा प्रदान करता है। हमारे अनुभवी शिक्षक मजबूत पढ़ाई के साथ खेल, कला और संस्कार पर ध्यान देते हैं ताकि हर बच्चा आत्मविश्वास के साथ आगे बढ़े।'),
  mission = coalesce(mission, 'To help every child discover their talents, think creatively, act responsibly and grow into a confident, caring citizen.'),
  mission_hi = coalesce(mission_hi, 'हर बच्चे को अपनी प्रतिभा पहचानने, रचनात्मक सोचने, जिम्मेदारी से कार्य करने और एक आत्मविश्वासी, संवेदनशील नागरिक बनने में सहायता करना।')
WHERE id = 1;

UPDATE public_pages SET body = CASE key
  WHEN 'about' THEN 'We believe that every child is unique. Small class sizes, caring teachers and regular parent–teacher interaction help us understand and support each learner.'
  WHEN 'academics' THEN 'Classes 1 to 12 follow a structured curriculum with regular unit tests, term examinations and continuous assessment. Smart classrooms, laboratories and a library support hands-on learning.

Students receive report cards each term with subject-wise marks, grades and teacher remarks.'
  WHEN 'preschool' THEN 'Our preschool (Playgroup, Nursery, LKG and UKG) is a warm, play-based space where little ones learn through stories, songs, art, games and activities.

Instead of exams, teachers share descriptive progress cards covering language, numbers, motor skills, social skills and creativity.'
  WHEN 'hostel' THEN 'Separate, supervised hostel facilities provide a homely environment with nutritious meals, fixed study hours, and resident wardens available round the clock.'
  WHEN 'facilities' THEN 'Our campus is designed for safe, active and modern learning.'
  WHEN 'transport' THEN 'School buses cover major routes of the city with trained drivers and attendants. Transport is optional and charged only for students who opt in.'
  WHEN 'admissions' THEN 'Admissions are open for Playgroup to Class 12. Fill the enquiry form below and the school office will contact you to schedule a visit and interaction.'
  WHEN 'contact' THEN 'Visit us on any working day between 9:00 AM and 4:00 PM, or call the school office.'
  ELSE body END
WHERE coalesce(body, '') = '';

INSERT INTO facilities (title, title_hi, description, description_hi, icon, sort_order)
SELECT * FROM (VALUES
  ('Smart Classrooms', 'स्मार्ट कक्षाएँ', 'Bright, ventilated classrooms with digital teaching aids.', 'डिजिटल शिक्षण साधनों से युक्त हवादार कक्षाएँ।', 'computer', 1),
  ('Science Laboratories', 'विज्ञान प्रयोगशालाएँ', 'Well-equipped physics, chemistry and biology labs.', 'भौतिकी, रसायन और जीव विज्ञान की सुसज्जित प्रयोगशालाएँ।', 'lab', 2),
  ('Library', 'पुस्तकालय', 'Thousands of books, magazines and a quiet reading space.', 'हज़ारों पुस्तकें, पत्रिकाएँ और शांत अध्ययन कक्ष।', 'library', 3),
  ('Sports & Games', 'खेलकूद', 'Playground, indoor games, yoga and annual sports meet.', 'खेल का मैदान, इनडोर खेल, योग और वार्षिक खेलकूद।', 'sports', 4),
  ('Art & Music', 'कला एवं संगीत', 'Drawing, craft, dance and music to build creativity.', 'रचनात्मकता के लिए चित्रकला, शिल्प, नृत्य और संगीत।', 'art', 5),
  ('Safe Transport', 'सुरक्षित परिवहन', 'GPS-tracked school buses on major city routes.', 'प्रमुख मार्गों पर स्कूल बसें।', 'bus', 6),
  ('Hostel', 'छात्रावास', 'Homely residential facility with wardens and healthy meals.', 'वार्डन और पौष्टिक भोजन के साथ घर जैसा छात्रावास।', 'hostel', 7),
  ('Safety & CCTV', 'सुरक्षा', 'Secure campus with CCTV surveillance and trained staff.', 'सीसीटीवी निगरानी के साथ सुरक्षित परिसर।', 'security', 8)
) AS v(title, title_hi, description, description_hi, icon, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM facilities);

ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS school_hours text DEFAULT 'Mon–Sat, 9:00 AM – 4:00 PM';
ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS school_hours_hi text DEFAULT 'सोम–शनि, सुबह 9:00 – शाम 4:00';
