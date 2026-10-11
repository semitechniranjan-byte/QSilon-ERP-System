# School Management System

A full-stack school ERP for a school with **Preschool (Playgroup–UKG) through Class 12**, CBSE/BSEB boards,
English/Hindi medium, hostel residents, day scholars and optional transport. It includes a public website,
and portals for the **Principal/Administrator** (plus an optional Accountant role), **Teachers** and **Students**.

- **Frontend:** React 18 + Vite + Tailwind CSS (English / हिन्दी interface toggle)
- **Backend:** Node.js 20+ / Express, server-side validation (zod), session auth (bcrypt, PostgreSQL session store)
- **Database:** PostgreSQL (designed for your **Render PostgreSQL** instance) with versioned SQL migrations
- **Documents:** printable HTML + server-generated PDF receipts and report cards (Noto Sans / Noto Sans Devanagari, Hindi shaping supported)
- **Exports:** CSV and Excel (.xlsx)

---

## 1. Deploying on Render (your hosting)

You need: the Render PostgreSQL database you already have, and a Render **Web Service** for this repository.
No other paid service is required.

### Step 1 – Create the web service
1. In Render, click **New → Blueprint** and select this GitHub repository (it contains `render.yaml`),
   **or** click **New → Web Service** and use these settings:
   | Setting | Value |
   |---|---|
   | Runtime | Node |
   | Build command | `npm ci --include=dev && npm run build` |
   | Pre-deploy command | `npm run migrate:prod` |
   | Start command | `npm start` |
   | Health check path | `/api/health` |
2. Choose the same **region** as your database.

### Step 2 – Environment variables (Web Service → Environment)
| Variable | Required | Value |
|---|---|---|
| `DATABASE_URL` | yes | Your Render PostgreSQL **Internal Database URL** (Database → Connect → Internal). Paste it here only — never in code or chat. |
| `SESSION_SECRET` | yes | A long random string (the Blueprint generates one automatically). |
| `NODE_ENV` | yes | `production` |
| `SETUP_TOKEN` | first run | Any secret phrase. Lets you create the first Principal account from `/setup`. Remove it after setup. |
| `DB_SCHEMA` | only if needed | e.g. `sms` — installs all tables into a separate schema (see “Existing databases”). |
| `SESSION_MAX_AGE_HOURS` | optional | Sign-in session length, default `8`. |
| `RUN_MIGRATIONS_ON_START` | optional | `true` to run migrations when the server starts (use if your plan has no pre-deploy command). |

### Step 3 – Deploy and create the Principal account
1. Deploy. The pre-deploy command runs the database migrations (safe to run on every deploy).
2. Open `https://<your-service>.onrender.com/setup`, enter the `SETUP_TOKEN`, the school name, and the Principal's user ID and password.
   *Alternative:* in Render → Shell run `ADMIN_USERNAME=principal ADMIN_NAME="Principal" ADMIN_PASSWORD='...' node dist/server/cli.js create-admin`.
3. Delete `SETUP_TOKEN` from the environment (setup is also disabled automatically once an administrator exists).

### Step 4 – Configure the school (in this order)
1. **Settings → School profile:** name (English/Hindi), logo, address, phone, email, map link, established year, statistics mode, ID/receipt prefixes, login options.
2. **Settings → Academic years:** create the current year (e.g. `2026-27`, 01-04-2026 to 31-03-2027).
3. **Classes & Sections:** classes Playgroup–Class 12 are pre-created; add sections (A, B …) with board, medium, class teacher, capacity.
4. **Subjects**, then **Classes & Sections → Class subjects** for each class.
5. **Teachers:** add teachers (ID + login generated), then **Assign subjects** per class/section.
6. **Fees → Fee Plans:** a preschool plan, school plans per class, and a hostel plan. **Transport:** add routes with monthly fees.
7. **Hostel:** hostels, rooms (beds are created from capacity).
8. **Admissions:** admit students (ID, admission no., roll no. and login generated) and choose fee plans.
9. **Fees → Invoices → Generate invoices** each month (or for a range of months). Then collect fees.
10. **Website:** edit page content, facilities and gallery.

### Optional demo data
To try the system with sample data (clearly marked “(Demo)” / “[DEMO]”): Render Shell → `node dist/server/cli.js seed-demo`.
Remove it before going live: `node dist/server/cli.js remove-demo`. Removal deletes only demo-flagged records; anything a
real record still uses (e.g. a section a real student is in) is kept.

---

## 2. Existing databases and safety

- Migrations live in `server/db/migrations/*.sql`, are applied in order inside transactions, and are recorded in
  `schema_migrations`. They only **create** objects (`CREATE … IF NOT EXISTS`) — no migration drops tables or deletes data.
- If the database already contains tables with the same names that were **not** created by this app
  (`users`, `students`, `payments`, …), migration **stops without changing anything** and tells you.
  Set `DB_SCHEMA=sms` to install into its own schema next to your existing tables.
- A PostgreSQL advisory lock prevents two migrations running at once.

## 3. Backups and restore

- Render PostgreSQL paid plans include automatic daily backups (Database → Recovery). Check your plan.
- Manual backup from your computer (use the **External** URL):
  `pg_dump "<EXTERNAL_DATABASE_URL>" -Fc -f school-$(date +%F).dump`
- Restore into an empty database: `pg_restore --no-owner -d "<TARGET_DATABASE_URL>" school-YYYY-MM-DD.dump`
- Uploaded files (photos, documents, logo, gallery) are stored **inside the database**, so a database backup includes them.

## 4. Local development

```bash
cp .env.example .env          # set DATABASE_URL to a local/dev PostgreSQL and SESSION_SECRET
npm install
npm run migrate
ADMIN_USERNAME=principal ADMIN_PASSWORD='Change-me-123' npm run create-admin
npm run seed:demo             # optional
npm run dev                   # web on http://localhost:5000, API on :3001
npm test                      # runs against TEST_DATABASE_URL (default postgres://sms:sms_dev@localhost:5432/sms_test)
```
The test database is **wiped** by the test suite — never point `TEST_DATABASE_URL` at real data.
To run the production build locally over plain HTTP: `npm run build && COOKIE_SECURE=false NODE_ENV=production npm start`.

---

## 5. How key rules are implemented

**Fees** (all money is stored as integer paise; totals are always computed on the server)
- A student's charges come from their **base plan** (preschool or class plan) + **hostel plan** (only while a hostel resident)
  + **transport** (route's monthly fee, only when transport is opted in). Transport cannot be put inside a plan.
- If the hostel plan includes a category that is also in the base plan (a package, e.g. tuition), the hostel item replaces it — never both.
- Billing frequencies: monthly; quarterly / half-yearly on their cycle; annual once per academic year; **one-time once per student, ever** (admission, uniform).
- Each charge has a unique key, so generating invoices again (or after a crash/retry) never bills twice.
- Concessions/scholarships (percent or fixed) apply to invoices generated afterwards; **waivers** adjust already-issued lines. Both are audited.
- Payments run in a database transaction with a per-student lock, cannot exceed the outstanding balance, and use an
  idempotency key so a double-click or retry records only one payment. Reversals (e.g. bounced cheque) and refunds are separate, authorized and audited.
- **Fees Cleared** is shown only when the outstanding balance on billed invoices is exactly zero.

**Receipts** are created only from a recorded payment and store an immutable snapshot. Printing or downloading never changes
any balance. Signature areas (school, parent/guardian, student) are blank lines — the system never claims anyone signed.

**Access control** is enforced on the server for every endpoint: teachers see only sections where they are class teacher or
teach a subject; students can only ever read their own records (their ID is taken from the session, never from the URL).
Extra permissions (e.g. letting a teacher view fees) are granted per user under **Users & access**.

**Results:** teachers enter marks only for their own subject/section while marks entry is open, then submit; the Principal
approves or returns, then publishes. Students see only approved marks of published exams. Preschool uses descriptive
development ratings instead of marks.

**Attendance:** one record per student per date/session (no duplicates). Teachers can edit within a configurable window;
later corrections need the Principal (or the `attendance.correct_any` permission) and are written to the audit log.
Attendance % = (present + late + ½ half-day) ÷ (marked days − approved leave).

## 6. Security notes
bcrypt password hashing; temporary passwords must be changed at first sign-in; account lockout after 5 failed attempts;
login and enquiry rate limits; session regeneration on sign-in; HTTP-only SameSite cookies (Secure in production);
CSRF tokens on every state-changing request; Helmet security headers and a strict Content-Security-Policy;
parameterized SQL everywhere; file uploads limited to 5 MB and checked by content (PDF, DOCX, JPEG, PNG, WebP);
private files are served only after an access check; spreadsheet exports neutralize formula injection;
the public website shows only aggregate counts and explicitly published content.

## 7. Messaging (SMS / WhatsApp / email)
Fee reminders and notices create entries in the message log. **No provider is connected yet**, so messages are recorded
with status `not configured` and are **not sent**. To send real messages, a provider account (e.g. an SMS gateway,
WhatsApp Business API, or SMTP mailbox) and a small adapter are needed; the integration point is `message_outbox`
(Settings → Messaging shows the log). Environment variables reserved: `SMS_API_URL`, `WHATSAPP_API_URL`, `SMTP_URL`.

---

## 8. Feature checklist

**Completed and tested** (automated tests in `tests/` + browser checks)
- [x] Public website (home, about, academics, preschool, hostel, facilities, gallery, notices, contact, admission enquiry), editable content, aggregate statistics only
- [x] Sign-in by ID / admission no. / CLASS-SECTION-ROLL (configurable), first-time setup, forced password change, office-assisted password reset, lockout
- [x] Roles: Principal/Admin, Accountant, Teacher, Student; per-user extra permissions; server-side authorization
- [x] Admissions with guardians, photo, documents, duplicate detection, auto IDs/admission no./roll no., fee plan selection
- [x] Promotion / detention / completion with full history preserved; withdrawal, transfer, re-admission
- [x] Teachers, multiple subject–section assignments, class teachers, staff attendance, timetable with clash prevention
- [x] Student attendance (present/absent/late/half-day/leave), daily overview, monthly register, %, audited corrections
- [x] Fee categories & plans (preschool / school / hostel), transport routes, concessions, idempotent invoicing, partial payments, receipts (print + PDF, EN/HI), reprint, search, reversals, refunds, waivers, collection / outstanding / class-wise / date-wise reports, CSV/Excel
- [x] Hostel buildings, rooms, beds, allocation with capacity enforcement, transfers, check-out, occupancy & vacant-bed reports
- [x] Exams, subject maximum/pass marks, grading scales, teacher marks entry → review → publish/withdraw, class results, ranks, report cards (print + PDF)
- [x] Preschool descriptive assessment and progress cards
- [x] Assignments with submissions and feedback, study materials, quizzes (MCQ / true-false auto-graded, short answers teacher-reviewed, time limits, attempts)
- [x] Notices (audience-targeted), events / academic calendar, enquiries, profile correction requests
- [x] English/Hindi interface, Hindi PDFs, responsive layouts, audit log, removable demo data

**Not implemented / needs your input**
- [ ] Actual SMS/WhatsApp/email delivery — needs a provider account and credentials (see §7)
- [ ] Online fee payment gateway (UPI/card collection by parents) — needs a gateway account (e.g. Razorpay); staff record payments today
- [ ] Digital signature capture — intentionally not enabled; receipts have blank signature areas
- [ ] Parent portal — the data model already links guardians to users (`guardians.user_id`), but no parent login screens yet
- [ ] Subject-wise (period-wise) attendance — attendance is daily (with optional morning/afternoon sessions)
- [ ] Automatic scheduled reminders — reminders are queued manually from Fees → Reports
- [ ] Interface translation covers navigation, dashboards and main labels; some detailed form labels remain in English
