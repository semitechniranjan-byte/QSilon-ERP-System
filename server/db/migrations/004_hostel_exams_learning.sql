-- 004: hostel, examinations, assessments, assignments, quizzes, communication, public content

CREATE TABLE IF NOT EXISTS hostels (
  id bigserial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  hostel_type text NOT NULL DEFAULT 'boys' CHECK (hostel_type IN ('boys','girls','co_ed')),
  building text,
  warden_name text,
  warden_phone text,
  emergency_phone text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS hostel_rooms (
  id bigserial PRIMARY KEY,
  hostel_id bigint NOT NULL REFERENCES hostels(id),
  room_no text NOT NULL,
  floor text,
  room_type text,
  capacity int NOT NULL CHECK (capacity > 0 AND capacity <= 50),
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (hostel_id, room_no)
);
CREATE TABLE IF NOT EXISTS hostel_beds (
  id bigserial PRIMARY KEY,
  room_id bigint NOT NULL REFERENCES hostel_rooms(id),
  bed_no text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (room_id, bed_no)
);
CREATE TABLE IF NOT EXISTS hostel_allocations (
  id bigserial PRIMARY KEY,
  student_id bigint NOT NULL REFERENCES students(id),
  bed_id bigint NOT NULL REFERENCES hostel_beds(id),
  room_id bigint NOT NULL REFERENCES hostel_rooms(id),
  check_in date NOT NULL,
  check_out date,
  allocated_by bigint REFERENCES users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (check_out IS NULL OR check_out >= check_in)
);
CREATE UNIQUE INDEX IF NOT EXISTS hostel_bed_active_uniq ON hostel_allocations(bed_id) WHERE check_out IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS hostel_student_active_uniq ON hostel_allocations(student_id) WHERE check_out IS NULL;

CREATE TABLE IF NOT EXISTS grading_scales (
  id bigserial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  is_default boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS grading_bands (
  id bigserial PRIMARY KEY,
  scale_id bigint NOT NULL REFERENCES grading_scales(id) ON DELETE CASCADE,
  min_percent numeric(5,2) NOT NULL,
  grade text NOT NULL,
  grade_point numeric(4,2),
  remark text,
  UNIQUE (scale_id, grade)
);

CREATE TABLE IF NOT EXISTS exams (
  id bigserial PRIMARY KEY,
  academic_year_id bigint NOT NULL REFERENCES academic_years(id),
  term_id bigint REFERENCES terms(id),
  name text NOT NULL,
  exam_type text NOT NULL DEFAULT 'term' CHECK (exam_type IN ('unit','term','half_yearly','final','preschool_assessment','other')),
  assessment_mode text NOT NULL DEFAULT 'marks' CHECK (assessment_mode IN ('marks','descriptive')),
  grading_scale_id bigint REFERENCES grading_scales(id),
  pass_percent numeric(5,2) NOT NULL DEFAULT 33,
  start_date date,
  end_date date,
  schedule_published boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','marks_entry','published','withdrawn')),
  published_at timestamptz,
  published_by bigint REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (academic_year_id, name)
);
CREATE TABLE IF NOT EXISTS exam_subjects (
  id bigserial PRIMARY KEY,
  exam_id bigint NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  class_level_id bigint NOT NULL REFERENCES class_levels(id),
  subject_id bigint NOT NULL REFERENCES subjects(id),
  max_marks numeric(6,2) NOT NULL CHECK (max_marks > 0),
  pass_marks numeric(6,2) NOT NULL CHECK (pass_marks >= 0),
  exam_date date,
  start_time time,
  duration_min int,
  UNIQUE (exam_id, class_level_id, subject_id),
  CHECK (pass_marks <= max_marks)
);
CREATE TABLE IF NOT EXISTS marks (
  id bigserial PRIMARY KEY,
  exam_subject_id bigint NOT NULL REFERENCES exam_subjects(id),
  student_id bigint NOT NULL REFERENCES students(id),
  enrollment_id bigint NOT NULL REFERENCES enrollments(id),
  marks_obtained numeric(6,2) CHECK (marks_obtained IS NULL OR marks_obtained >= 0),
  is_absent boolean NOT NULL DEFAULT false,
  remarks text,
  entered_by bigint REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_subject_id, student_id)
);
-- Workflow state of marks per exam subject and section: teacher drafts, submits; principal approves.
CREATE TABLE IF NOT EXISTS mark_submissions (
  id bigserial PRIMARY KEY,
  exam_subject_id bigint NOT NULL REFERENCES exam_subjects(id),
  section_id bigint NOT NULL REFERENCES sections(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','returned')),
  submitted_by bigint REFERENCES users(id),
  submitted_at timestamptz,
  reviewed_by bigint REFERENCES users(id),
  reviewed_at timestamptz,
  review_note text,
  UNIQUE (exam_subject_id, section_id)
);

CREATE TABLE IF NOT EXISTS assessment_domains (
  id bigserial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  name_hi text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS development_assessments (
  id bigserial PRIMARY KEY,
  exam_id bigint NOT NULL REFERENCES exams(id),
  student_id bigint NOT NULL REFERENCES students(id),
  enrollment_id bigint NOT NULL REFERENCES enrollments(id),
  domain_id bigint NOT NULL REFERENCES assessment_domains(id),
  rating text NOT NULL CHECK (rating IN ('beginning','developing','proficient','excellent')),
  comment text,
  entered_by bigint REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_id, student_id, domain_id)
);
CREATE TABLE IF NOT EXISTS report_card_remarks (
  exam_id bigint NOT NULL REFERENCES exams(id),
  student_id bigint NOT NULL REFERENCES students(id),
  teacher_remark text,
  principal_remark text,
  updated_by bigint REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (exam_id, student_id)
);

CREATE TABLE IF NOT EXISTS assignments (
  id bigserial PRIMARY KEY,
  section_id bigint NOT NULL REFERENCES sections(id),
  subject_id bigint NOT NULL REFERENCES subjects(id),
  teacher_id bigint NOT NULL REFERENCES teachers(id),
  title text NOT NULL,
  description text,
  due_date date,
  max_marks numeric(6,2),
  allow_submission boolean NOT NULL DEFAULT true,
  attachment_file_id uuid REFERENCES files(id),
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assignments_section_idx ON assignments(section_id);
CREATE TABLE IF NOT EXISTS assignment_submissions (
  id bigserial PRIMARY KEY,
  assignment_id bigint NOT NULL REFERENCES assignments(id),
  student_id bigint NOT NULL REFERENCES students(id),
  text_answer text,
  file_id uuid REFERENCES files(id),
  submitted_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','submitted','completed','returned')),
  marks numeric(6,2),
  feedback text,
  reviewed_by bigint REFERENCES users(id),
  reviewed_at timestamptz,
  UNIQUE (assignment_id, student_id)
);
CREATE TABLE IF NOT EXISTS study_materials (
  id bigserial PRIMARY KEY,
  section_id bigint NOT NULL REFERENCES sections(id),
  subject_id bigint NOT NULL REFERENCES subjects(id),
  teacher_id bigint NOT NULL REFERENCES teachers(id),
  title text NOT NULL,
  description text,
  file_id uuid REFERENCES files(id),
  link_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quizzes (
  id bigserial PRIMARY KEY,
  section_id bigint NOT NULL REFERENCES sections(id),
  subject_id bigint NOT NULL REFERENCES subjects(id),
  teacher_id bigint NOT NULL REFERENCES teachers(id),
  title text NOT NULL,
  instructions text,
  time_limit_min int CHECK (time_limit_min IS NULL OR time_limit_min > 0),
  available_from timestamptz,
  available_until timestamptz,
  max_attempts int NOT NULL DEFAULT 1 CHECK (max_attempts > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','closed')),
  show_results boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS quiz_questions (
  id bigserial PRIMARY KEY,
  quiz_id bigint NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  qtype text NOT NULL CHECK (qtype IN ('mcq','true_false','short_answer')),
  prompt text NOT NULL,
  options jsonb,
  correct_option int,
  correct_bool boolean,
  answer_key text,
  marks numeric(5,2) NOT NULL DEFAULT 1 CHECK (marks > 0),
  sort_order int NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id bigserial PRIMARY KEY,
  quiz_id bigint NOT NULL REFERENCES quizzes(id),
  student_id bigint NOT NULL REFERENCES students(id),
  attempt_no int NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  deadline_at timestamptz,
  submitted_at timestamptz,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','pending_review','graded')),
  score numeric(7,2),
  max_score numeric(7,2),
  feedback text,
  UNIQUE (quiz_id, student_id, attempt_no)
);
CREATE TABLE IF NOT EXISTS quiz_answers (
  id bigserial PRIMARY KEY,
  attempt_id bigint NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  question_id bigint NOT NULL REFERENCES quiz_questions(id),
  answer jsonb,
  is_correct boolean,
  awarded_marks numeric(5,2),
  needs_review boolean NOT NULL DEFAULT false,
  feedback text,
  UNIQUE (attempt_id, question_id)
);

CREATE TABLE IF NOT EXISTS notices (
  id bigserial PRIMARY KEY,
  title text NOT NULL,
  title_hi text,
  body text NOT NULL,
  body_hi text,
  audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('public','all','staff','teachers','students','section','hostel')),
  section_id bigint REFERENCES sections(id),
  pinned boolean NOT NULL DEFAULT false,
  publish_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  attachment_file_id uuid REFERENCES files(id),
  created_by bigint REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (audience <> 'section' OR section_id IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS events (
  id bigserial PRIMARY KEY,
  title text NOT NULL,
  title_hi text,
  description text,
  event_type text NOT NULL DEFAULT 'event' CHECK (event_type IN ('event','holiday','exam','meeting','activity')),
  start_date date NOT NULL,
  end_date date,
  location text,
  is_public boolean NOT NULL DEFAULT true,
  created_by bigint REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public_pages (
  key text PRIMARY KEY CHECK (key IN ('about','academics','preschool','hostel','facilities','transport','admissions','contact')),
  title text NOT NULL,
  title_hi text,
  body text NOT NULL DEFAULT '',
  body_hi text,
  updated_by bigint REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS gallery_items (
  id bigserial PRIMARY KEY,
  title text NOT NULL,
  title_hi text,
  file_id uuid NOT NULL REFERENCES files(id),
  sort_order int NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS facilities (
  id bigserial PRIMARY KEY,
  title text NOT NULL,
  title_hi text,
  description text,
  description_hi text,
  icon text NOT NULL DEFAULT 'star',
  sort_order int NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS admission_enquiries (
  id bigserial PRIMARY KEY,
  student_name text NOT NULL,
  dob date,
  class_sought text NOT NULL,
  parent_name text NOT NULL,
  phone text NOT NULL,
  email text,
  message text,
  needs_hostel boolean NOT NULL DEFAULT false,
  needs_transport boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','admitted','closed')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
