import { lazy, Suspense } from 'react';
import { Route, Routes, Link } from 'react-router-dom';
import { PublicLayout } from './components/PublicLayout';
import { AppLayout } from './components/AppLayout';
import { Loading } from './components/ui';
import Home from './pages/public/Home';
import InfoPage, { GalleryPage, NoticesPage } from './pages/public/InfoPage';
import EnquiryPage from './pages/public/Enquiry';
import { ChangePasswordPage, ForgotPasswordPage, LoginPage, SetupPage } from './pages/public/Auth';

const L = (f: () => Promise<{ default: React.ComponentType<any> }>) => lazy(f);
// Admin
const AdminDashboard = L(() => import('./pages/admin/Dashboard'));
const Students = L(() => import('./pages/admin/Students'));
const StudentForm = L(() => import('./pages/admin/StudentForm'));
const StudentProfile = L(() => import('./pages/admin/StudentProfile'));
const AdmissionCard = L(() => import('./pages/admin/AdmissionCard'));
const FeeCard = L(() => import('./pages/admin/FeeCard'));
const Promotion = L(() => import('./pages/admin/Promotion'));
const Enquiries = L(() => import('./pages/admin/Enquiries'));
const Teachers = L(() => import('./pages/admin/Teachers'));
const TeacherProfile = L(() => import('./pages/admin/TeacherProfile'));
const Classes = L(() => import('./pages/admin/Classes'));
const Subjects = L(() => import('./pages/admin/Subjects'));
const TimetableAdmin = L(() => import('./pages/admin/TimetableAdmin'));
const AttendanceOverview = L(() => import('./pages/admin/AttendanceOverview'));
const Exams = L(() => import('./pages/admin/Exams'));
const ExamDetail = L(() => import('./pages/admin/ExamDetail'));
const Collect = L(() => import('./pages/admin/fees/Collect'));
const Receipts = L(() => import('./pages/admin/fees/Receipts'));
const ReceiptView = L(() => import('./pages/shared/ReceiptView'));
const Invoices = L(() => import('./pages/admin/fees/Invoices'));
const Plans = L(() => import('./pages/admin/fees/Plans'));
const Concessions = L(() => import('./pages/admin/fees/Concessions'));
const FeeReports = L(() => import('./pages/admin/fees/FeeReports'));
const Transport = L(() => import('./pages/admin/fees/Transport'));
const Hostel = L(() => import('./pages/admin/Hostel'));
const NoticesAdmin = L(() => import('./pages/admin/NoticesAdmin'));
const Reports = L(() => import('./pages/admin/Reports'));
const Website = L(() => import('./pages/admin/Website'));
const Settings = L(() => import('./pages/admin/Settings'));
const Users = L(() => import('./pages/admin/Users'));
const Audit = L(() => import('./pages/admin/Audit'));
// Shared staff
const AttendanceMark = L(() => import('./pages/shared/AttendanceMark'));
const MarksEntry = L(() => import('./pages/shared/MarksEntry'));
const ClassResults = L(() => import('./pages/shared/ClassResults'));
const ReportCard = L(() => import('./pages/shared/ReportCard'));
const NoticeFeed = L(() => import('./pages/shared/NoticeFeed'));
const TimetableView = L(() => import('./pages/shared/TimetableView'));
const FeeStatementPage = L(() => import('./pages/shared/FeeStatementPage'));
// Teacher
const TeacherDashboard = L(() => import('./pages/teacher/Dashboard'));
const MyClasses = L(() => import('./pages/teacher/MyClasses'));
const AssignmentsT = L(() => import('./pages/teacher/Assignments'));
const QuizzesT = L(() => import('./pages/teacher/Quizzes'));
const MaterialsT = L(() => import('./pages/teacher/Materials'));
const TeacherSelf = L(() => import('./pages/teacher/Profile'));
// Student
const StudentDashboard = L(() => import('./pages/student/Dashboard'));
const StudentSelf = L(() => import('./pages/student/Profile'));
const StudentAttendance = L(() => import('./pages/student/Attendance'));
const StudentAssignments = L(() => import('./pages/student/Assignments'));
const StudentQuizzes = L(() => import('./pages/student/Quizzes'));
const QuizAttempt = L(() => import('./pages/student/QuizAttempt'));
const StudentMaterials = L(() => import('./pages/student/Materials'));
const StudentResults = L(() => import('./pages/student/Results'));
const StudentFees = L(() => import('./pages/student/Fees'));

function NotFound() {
  return <div className="mx-auto max-w-md px-4 py-24 text-center"><h1 className="text-2xl font-semibold">Page not found</h1><Link to="/" className="link mt-4 inline-block">Go home</Link></div>;
}

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Home />} />
          <Route path="about" element={<InfoPage pageKey="about" />} />
          <Route path="academics" element={<InfoPage pageKey="academics" />} />
          <Route path="preschool" element={<InfoPage pageKey="preschool" />} />
          <Route path="hostel" element={<InfoPage pageKey="hostel" />} />
          <Route path="facilities" element={<InfoPage pageKey="facilities" />} />
          <Route path="transport" element={<InfoPage pageKey="transport" />} />
          <Route path="contact" element={<InfoPage pageKey="contact" />} />
          <Route path="gallery" element={<GalleryPage />} />
          <Route path="notices" element={<NoticesPage />} />
          <Route path="admission" element={<EnquiryPage />} />
        </Route>
        <Route path="login" element={<LoginPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="change-password" element={<ChangePasswordPage />} />
        <Route path="setup" element={<SetupPage />} />

        <Route path="admin" element={<AppLayout roles={['admin', 'accountant']} />}>
          <Route index element={<AdminDashboard />} />
          <Route path="students" element={<Students />} />
          <Route path="students/new" element={<StudentForm />} />
          <Route path="students/:id" element={<StudentProfile />} />
          <Route path="students/:id/edit" element={<StudentForm />} />
          <Route path="students/:id/admission-card" element={<AdmissionCard />} />
          <Route path="students/:id/fee-card" element={<FeeCard />} />
          <Route path="promotion" element={<Promotion />} />
          <Route path="enquiries" element={<Enquiries />} />
          <Route path="teachers" element={<Teachers />} />
          <Route path="teachers/:id" element={<TeacherProfile />} />
          <Route path="classes" element={<Classes />} />
          <Route path="subjects" element={<Subjects />} />
          <Route path="timetable" element={<TimetableAdmin />} />
          <Route path="attendance" element={<AttendanceOverview />} />
          <Route path="attendance/mark" element={<AttendanceMark />} />
          <Route path="exams" element={<Exams />} />
          <Route path="exams/:id" element={<ExamDetail />} />
          <Route path="exams/:id/marks" element={<MarksEntry />} />
          <Route path="exams/:id/results" element={<ClassResults />} />
          <Route path="exams/:id/report-card/:studentId" element={<ReportCard />} />
          <Route path="fees/collect" element={<Collect />} />
          <Route path="fees/receipts" element={<Receipts />} />
          <Route path="fees/receipts/:id" element={<ReceiptView />} />
          <Route path="fees/invoices" element={<Invoices />} />
          <Route path="fees/plans" element={<Plans />} />
          <Route path="fees/concessions" element={<Concessions />} />
          <Route path="fees/reports" element={<FeeReports />} />
          <Route path="fees/student/:id" element={<FeeStatementPage />} />
          <Route path="transport" element={<Transport />} />
          <Route path="hostel" element={<Hostel />} />
          <Route path="notices" element={<NoticesAdmin />} />
          <Route path="reports" element={<Reports />} />
          <Route path="website" element={<Website />} />
          <Route path="settings" element={<Settings />} />
          <Route path="users" element={<Users />} />
          <Route path="audit" element={<Audit />} />
        </Route>

        <Route path="teacher" element={<AppLayout roles={['teacher']} />}>
          <Route index element={<TeacherDashboard />} />
          <Route path="classes" element={<MyClasses />} />
          <Route path="students/:id" element={<StudentProfile />} />
          <Route path="attendance" element={<AttendanceMark />} />
          <Route path="marks" element={<MarksEntry />} />
          <Route path="results" element={<ClassResults />} />
          <Route path="report-card/:examId/:studentId" element={<ReportCard />} />
          <Route path="assignments" element={<AssignmentsT />} />
          <Route path="quizzes" element={<QuizzesT />} />
          <Route path="materials" element={<MaterialsT />} />
          <Route path="timetable" element={<TimetableView />} />
          <Route path="notices" element={<NoticeFeed />} />
          <Route path="fees" element={<Receipts />} />
          <Route path="fees/student/:id" element={<FeeStatementPage />} />
          <Route path="fees/receipts/:id" element={<ReceiptView />} />
          <Route path="profile" element={<TeacherSelf />} />
        </Route>

        <Route path="student" element={<AppLayout roles={['student']} />}>
          <Route index element={<StudentDashboard />} />
          <Route path="profile" element={<StudentSelf />} />
          <Route path="attendance" element={<StudentAttendance />} />
          <Route path="timetable" element={<TimetableView />} />
          <Route path="assignments" element={<StudentAssignments />} />
          <Route path="quizzes" element={<StudentQuizzes />} />
          <Route path="quizzes/attempt/:id" element={<QuizAttempt />} />
          <Route path="materials" element={<StudentMaterials />} />
          <Route path="results" element={<StudentResults />} />
          <Route path="results/:examId" element={<ReportCard />} />
          <Route path="fees" element={<StudentFees />} />
          <Route path="fees/receipts/:id" element={<ReceiptView />} />
          <Route path="notices" element={<NoticeFeed />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
