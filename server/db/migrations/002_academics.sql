-- 002_academics: academic structure, people, enrollments, attendance

CREATE TABLE IF NOT EXISTS academic_years (
  id bigserial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_current boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('planned','active','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date > start_date)
);
CREATE UNIQUE INDEX IF NOT EXISTS academic_years_one_current ON academic_years(is_current) WHERE is_current;

CREATE TABLE IF NOT EXISTS terms (
  id bigserial PRIMARY KEY,
  academic_year_id bigint NOT NULL REFERENCES academic_years(id),
  name text NOT NULL,
  start_date date,
  end_date date,
  UNIQUE (academic_year_id, name)
);

CREATE TABLE IF NOT EXISTS boards (
  id bigserial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS mediums (
  id bigserial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS class_levels (
  id bigserial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  name_hi text,
  code text NOT NULL UNIQUE,
  sort_order int NOT NULL,
  is_preschool boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS subjects (
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  name_hi text,
  code text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS teachers (
  id bigserial PRIMARY KEY,
  user_id bigint UNIQUE REFERENCES users(id),
  employee_code text NOT NULL UNIQUE,
  first_name text NOT NULL,
  last_name text,
  gender text CHECK (gender IN ('male','female','other')),
  dob date,
  phone text,
  email citext,
  address text,
  qualification text,
  experience_years numeric(4,1),
  designation text,
  joining_date date,
  photo_file_id uuid REFERENCES files(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','left')),
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sections (
  id bigserial PRIMARY KEY,
  academic_year_id bigint NOT NULL REFERENCES academic_years(id),
  class_level_id bigint NOT NULL REFERENCES class_levels(id),
  name text NOT NULL,
  board_id bigint REFERENCES boards(id),
  medium_id bigint REFERENCES mediums(id),
  class_teacher_id bigint REFERENCES teachers(id),
  capacity int CHECK (capacity IS NULL OR capacity > 0),
  room text,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (academic_year_id, class_level_id, name)
);
CREATE INDEX IF NOT EXISTS sections_class_teacher_idx ON sections(class_teacher_id);

CREATE TABLE IF NOT EXISTS class_subjects (
  id bigserial PRIMARY KEY,
  academic_year_id bigint NOT NULL REFERENCES academic_years(id),
  class_level_id bigint NOT NULL REFERENCES class_levels(id),
  subject_id bigint NOT NULL REFERENCES subjects(id),
  is_optional boolean NOT NULL DEFAULT false,
  UNIQUE (academic_year_id, class_level_id, subject_id)
);

-- One teacher per subject per section; a teacher can hold many such assignments.
CREATE TABLE IF NOT EXISTS teaching_assignments (
  id bigserial PRIMARY KEY,
  section_id bigint NOT NULL REFERENCES sections(id),
  subject_id bigint NOT NULL REFERENCES subjects(id),
  teacher_id bigint NOT NULL REFERENCES teachers(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (section_id, subject_id)
);
CREATE INDEX IF NOT EXISTS teaching_assignments_teacher_idx ON teaching_assignments(teacher_id);

CREATE TABLE IF NOT EXISTS timetable_periods (
  id bigserial PRIMARY KEY,
  academic_year_id bigint NOT NULL REFERENCES academic_years(id),
  period_no int NOT NULL,
  label text,
  start_time time NOT NULL,
  end_time time NOT NULL,
  is_break boolean NOT NULL DEFAULT false,
  UNIQUE (academic_year_id, period_no)
);

CREATE TABLE IF NOT EXISTS timetable_entries (
  id bigserial PRIMARY KEY,
  section_id bigint NOT NULL REFERENCES sections(id),
  period_id bigint NOT NULL REFERENCES timetable_periods(id),
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  subject_id bigint REFERENCES subjects(id),
  teacher_id bigint REFERENCES teachers(id),
  room text,
  UNIQUE (section_id, day_of_week, period_id)
);
-- A teacher cannot be in two places at once.
CREATE UNIQUE INDEX IF NOT EXISTS timetable_teacher_clash ON timetable_entries(teacher_id, day_of_week, period_id) WHERE teacher_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS guardians (
  id bigserial PRIMARY KEY,
  user_id bigint UNIQUE REFERENCES users(id), -- reserved for a future parent portal
  name text NOT NULL,
  phone text,
  alt_phone text,
  email citext,
  occupation text,
  address text,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transport_routes (
  id bigserial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  description text,
  stops text,
  vehicle_no text,
  driver_name text,
  driver_phone text,
  monthly_fee_paise bigint NOT NULL DEFAULT 0 CHECK (monthly_fee_paise >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS students (
  id bigserial PRIMARY KEY,
  user_id bigint UNIQUE REFERENCES users(id),
  student_code text NOT NULL UNIQUE,
  admission_no text NOT NULL UNIQUE,
  first_name text NOT NULL,
  last_name text,
  name_hi text,
  dob date NOT NULL,
  gender text CHECK (gender IN ('male','female','other')),
  blood_group text,
  photo_file_id uuid REFERENCES files(id),
  address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  previous_school text,
  previous_class text,
  admission_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','withdrawn','transferred','alumni')),
  status_changed_at timestamptz,
  status_reason text,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS students_name_idx ON students(lower(first_name), lower(coalesce(last_name,'')));
CREATE INDEX IF NOT EXISTS students_status_idx ON students(status);

CREATE TABLE IF NOT EXISTS student_guardians (
  student_id bigint NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  guardian_id bigint NOT NULL REFERENCES guardians(id),
  relation text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  PRIMARY KEY (student_id, guardian_id)
);

-- One enrollment per student per academic year. History is never overwritten on promotion.
CREATE TABLE IF NOT EXISTS enrollments (
  id bigserial PRIMARY KEY,
  student_id bigint NOT NULL REFERENCES students(id),
  academic_year_id bigint NOT NULL REFERENCES academic_years(id),
  section_id bigint NOT NULL REFERENCES sections(id),
  class_level_id bigint NOT NULL REFERENCES class_levels(id),
  roll_no int NOT NULL CHECK (roll_no > 0),
  residency text NOT NULL DEFAULT 'day_scholar' CHECK (residency IN ('day_scholar','hostel')),
  transport_opted boolean NOT NULL DEFAULT false,
  transport_route_id bigint REFERENCES transport_routes(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','promoted','completed','withdrawn','transferred','detained')),
  enrolled_on date NOT NULL DEFAULT CURRENT_DATE,
  left_on date,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, academic_year_id),
  UNIQUE (section_id, roll_no),
  CHECK (NOT transport_opted OR transport_route_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS enrollments_section_idx ON enrollments(section_id);
CREATE INDEX IF NOT EXISTS enrollments_year_idx ON enrollments(academic_year_id, status);

CREATE TABLE IF NOT EXISTS student_documents (
  id bigserial PRIMARY KEY,
  student_id bigint NOT NULL REFERENCES students(id),
  file_id uuid NOT NULL REFERENCES files(id),
  doc_type text NOT NULL,
  uploaded_by bigint REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profile_correction_requests (
  id bigserial PRIMARY KEY,
  student_id bigint NOT NULL REFERENCES students(id),
  field text NOT NULL,
  current_value text,
  requested_value text NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by bigint REFERENCES users(id),
  reviewed_at timestamptz,
  response text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id bigserial PRIMARY KEY,
  student_id bigint NOT NULL REFERENCES students(id),
  enrollment_id bigint NOT NULL REFERENCES enrollments(id),
  section_id bigint NOT NULL REFERENCES sections(id),
  date date NOT NULL,
  session text NOT NULL DEFAULT 'full_day' CHECK (session IN ('full_day','morning','afternoon')),
  status text NOT NULL CHECK (status IN ('present','absent','late','half_day','leave')),
  remarks text,
  marked_by bigint REFERENCES users(id),
  marked_at timestamptz NOT NULL DEFAULT now(),
  updated_by bigint REFERENCES users(id),
  updated_at timestamptz,
  UNIQUE (student_id, date, session)
);
CREATE INDEX IF NOT EXISTS attendance_section_date_idx ON attendance_records(section_id, date);
CREATE INDEX IF NOT EXISTS attendance_enrollment_idx ON attendance_records(enrollment_id);

CREATE TABLE IF NOT EXISTS teacher_attendance (
  id bigserial PRIMARY KEY,
  teacher_id bigint NOT NULL REFERENCES teachers(id),
  date date NOT NULL,
  status text NOT NULL CHECK (status IN ('present','absent','late','half_day','leave')),
  remarks text,
  marked_by bigint REFERENCES users(id),
  marked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, date)
);
