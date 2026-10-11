import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import {
  BarChart3, BookOpen, Bus, ClipboardCheck, ClipboardList, FileText, Globe, GraduationCap, Home, IndianRupee, KeyRound, LayoutDashboard,
  LogOut, Megaphone, Menu, NotebookPen, Receipt, School, Settings, ShieldCheck, User as UserIcon, Users, X, BedDouble, ListChecks, Library, Clock, FileQuestion, Inbox,
} from 'lucide-react';
import { useAuth, type User } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { LangToggle } from './LangToggle';
import { Loading } from './ui';
import { BrandName, SchoolLogo } from './PublicLayout';

type Item = { to: string; label: string; icon: any; show?: (u: User, can: (p: string) => boolean) => boolean };
type Group = { label?: string; items: Item[] };

function menuFor(role: User['role']): Group[] {
  if (role === 'teacher') return [
    { items: [{ to: '/teacher', label: 'Dashboard', icon: LayoutDashboard }] },
    { label: 'Teaching', items: [
      { to: '/teacher/classes', label: 'My Classes', icon: Users },
      { to: '/teacher/attendance', label: 'Attendance', icon: ClipboardCheck },
      { to: '/teacher/marks', label: 'Marks Entry', icon: NotebookPen },
      { to: '/teacher/results', label: 'Results', icon: BarChart3 },
      { to: '/teacher/assignments', label: 'Assignments', icon: ClipboardList },
      { to: '/teacher/quizzes', label: 'Quizzes', icon: FileQuestion },
      { to: '/teacher/materials', label: 'Study Materials', icon: Library },
      { to: '/teacher/timetable', label: 'Timetable', icon: Clock },
    ] },
    { label: 'More', items: [
      { to: '/teacher/notices', label: 'Notices', icon: Megaphone },
      { to: '/teacher/fees', label: 'Fees', icon: IndianRupee, show: (_u, can) => can('fees.view') },
      { to: '/teacher/profile', label: 'My Profile', icon: UserIcon },
    ] },
  ];
  if (role === 'student') return [
    { items: [
      { to: '/student', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/student/profile', label: 'My Profile', icon: UserIcon },
      { to: '/student/attendance', label: 'Attendance', icon: ClipboardCheck },
      { to: '/student/timetable', label: 'Timetable', icon: Clock },
      { to: '/student/assignments', label: 'Assignments', icon: ClipboardList },
      { to: '/student/quizzes', label: 'Quizzes', icon: FileQuestion },
      { to: '/student/materials', label: 'Study Materials', icon: Library },
      { to: '/student/results', label: 'My Results', icon: GraduationCap },
      { to: '/student/fees', label: 'My Fees', icon: IndianRupee },
      { to: '/student/notices', label: 'Notices', icon: Megaphone },
    ] },
  ];
  const can = (p: string) => (_u: User, c: (p: string) => boolean) => c(p);
  return [
    { items: [{ to: '/admin', label: 'Dashboard', icon: LayoutDashboard }] },
    { label: 'People', items: [
      { to: '/admin/students', label: 'Students', icon: GraduationCap, show: can('students.view_all') },
      { to: '/admin/students/new', label: 'Admissions', icon: Users, show: can('students.manage') },
      { to: '/admin/promotion', label: 'Promotion', icon: ListChecks, show: can('students.manage') },
      { to: '/admin/enquiries', label: 'Enquiries', icon: Inbox, show: can('students.manage') },
      { to: '/admin/teachers', label: 'Teachers', icon: Users, show: can('teachers.manage') },
    ] },
    { label: 'Academics', items: [
      { to: '/admin/classes', label: 'Classes & Sections', icon: School, show: can('academics.manage') },
      { to: '/admin/subjects', label: 'Subjects', icon: BookOpen, show: can('academics.manage') },
      { to: '/admin/timetable', label: 'Timetable', icon: Clock, show: can('academics.manage') },
      { to: '/admin/attendance', label: 'Attendance', icon: ClipboardCheck, show: can('attendance.view_all') },
      { to: '/admin/exams', label: 'Examinations', icon: NotebookPen, show: can('exams.manage') },
    ] },
    { label: 'Finance', items: [
      { to: '/admin/fees/collect', label: 'Collect Fee', icon: IndianRupee, show: can('fees.collect') },
      { to: '/admin/fees/receipts', label: 'Receipts', icon: Receipt, show: can('fees.view') },
      { to: '/admin/fees/invoices', label: 'Invoices', icon: FileText, show: can('fees.view') },
      { to: '/admin/fees/plans', label: 'Fee Plans', icon: ClipboardList, show: can('fees.view') },
      { to: '/admin/fees/concessions', label: 'Concessions', icon: ShieldCheck, show: can('fees.view') },
      { to: '/admin/fees/reports', label: 'Reports', icon: BarChart3, show: can('fees.view') },
      { to: '/admin/transport', label: 'Transport', icon: Bus, show: can('transport.manage') },
    ] },
    { label: 'Campus', items: [
      { to: '/admin/hostel', label: 'Hostel', icon: BedDouble, show: can('hostel.manage') },
      { to: '/admin/notices', label: 'Notices & Events', icon: Megaphone, show: can('notices.manage') },
      { to: '/admin/reports', label: 'Reports', icon: FileText, show: can('reports.view') },
    ] },
    { label: 'Administration', items: [
      { to: '/admin/website', label: 'Website', icon: Globe, show: can('website.manage') },
      { to: '/admin/settings', label: 'Settings', icon: Settings, show: can('settings.manage') },
      { to: '/admin/users', label: 'Users & Access', icon: KeyRound, show: can('users.manage') },
      { to: '/admin/audit', label: 'Audit Log', icon: ShieldCheck, show: can('audit.view') },
    ] },
  ];
}

export function AppLayout({ roles }: { roles: User['role'][] }) {
  const { user, school, loading, logout, can } = useAuth();
  const { t, pick } = useI18n();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  if (loading) return <Loading />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;
  const groups = menuFor(user.role).map((g) => ({ ...g, items: g.items.filter((i) => !i.show || i.show(user, can)) })).filter((g) => g.items.length);
  const name = school ? pick(school.name, school.nameHi) : '';
  const sidebar = (
    <nav className="flex h-full flex-col" aria-label="Sidebar">
      <Link to="/" className="flex items-center gap-2 border-b border-brand-800 px-4 py-4">
        <SchoolLogo fileId={school?.logoFileId} name={school?.name ?? 'S'} className="h-9 w-9" />
        <BrandName name={name} className="text-white" />
      </Link>
      <div className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
        {groups.map((g, gi) => (
          <div key={gi}>
            {g.label && <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-brand-300">{t(g.label)}</p>}
            {g.items.map((i) => (
              <NavLink key={i.to} to={i.to} end={['/admin', '/teacher', '/student', '/admin/students'].includes(i.to)}
                className={({ isActive }) => `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm ${isActive ? 'bg-brand-700 font-medium text-white' : 'text-brand-100 hover:bg-brand-800 hover:text-white'}`}>
                <i.icon className="h-4 w-4 shrink-0" />{t(i.label)}
              </NavLink>
            ))}
          </div>
        ))}
      </div>
      <div className="border-t border-brand-800 p-3">
        <Link to="/" className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-brand-100 hover:bg-brand-800"><Home className="h-4 w-4" />{t('Website')}</Link>
      </div>
    </nav>
  );
  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 bg-brand-900 lg:block">{sidebar}</aside>
      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-brand-900">
            <button className="absolute right-2 top-3 p-2 text-white" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="no-print sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur">
          <button className="btn-ghost p-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <div className="hidden text-sm text-slate-500 lg:block">{user.role === 'admin' ? 'Principal / Administrator' : user.role === 'accountant' ? 'Accounts' : user.role === 'teacher' ? t('Teacher') : ''}</div>
          <div className="flex items-center gap-2">
            <LangToggle />
            <Link to="/change-password" className="btn-ghost btn-sm hidden sm:inline-flex" title={t('Change password')}><KeyRound className="h-4 w-4" /></Link>
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight text-slate-800">{user.displayName}</p>
              <p className="text-xs leading-tight text-slate-500">{user.username}</p>
            </div>
            <button className="btn-ghost btn-sm" onClick={logout} title={t('Logout')}><LogOut className="h-4 w-4" /><span className="hidden md:inline">{t('Logout')}</span></button>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6"><Outlet /></main>
      </div>
    </div>
  );
}
