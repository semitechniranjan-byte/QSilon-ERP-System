export type Role = 'admin' | 'accountant' | 'teacher' | 'student' | 'parent';

/**
 * Permission catalogue. Role defaults below; individual users can receive extra grants
 * (user_permissions table) — e.g. a teacher may be granted fees.view.
 */
export const PERMISSIONS = {
  'settings.manage': 'Manage school profile, academic years and configuration',
  'users.manage': 'Create, deactivate and reset user accounts',
  'teachers.manage': 'Manage teacher records and assignments',
  'students.manage': 'Admit, edit, promote and withdraw students',
  'students.view_all': 'View all student records',
  'academics.manage': 'Manage classes, sections, subjects and timetable',
  'attendance.view_all': 'View attendance for all classes',
  'attendance.correct_any': 'Correct any attendance record at any time',
  'fees.view': 'View fee records and reports',
  'fees.collect': 'Record payments and issue receipts',
  'fees.manage': 'Configure fee plans, generate invoices, approve concessions',
  'fees.refund': 'Authorize refunds, reversals and waivers',
  'hostel.manage': 'Manage hostels, rooms and allocations',
  'transport.manage': 'Manage transport routes',
  'exams.manage': 'Configure exams, review and publish results',
  'notices.manage': 'Publish notices and events',
  'website.manage': 'Edit public website content',
  'reports.view': 'View school-wide reports',
  'audit.view': 'View audit logs',
} as const;
export type Permission = keyof typeof PERMISSIONS;

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: Object.keys(PERMISSIONS) as Permission[],
  accountant: ['fees.view', 'fees.collect', 'students.view_all', 'reports.view'],
  teacher: [],
  student: [],
  parent: [],
};

/** Permissions that may be granted individually to staff accounts. */
export const GRANTABLE: Permission[] = ['fees.view', 'fees.collect', 'students.view_all', 'attendance.view_all', 'attendance.correct_any', 'notices.manage', 'reports.view', 'hostel.manage'];
