import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setCsrf } from './api';
import { useI18n } from './i18n';

export interface User {
  id: number; username: string; role: 'admin' | 'accountant' | 'teacher' | 'student' | 'parent'; displayName: string;
  preferredLanguage: 'en' | 'hi'; mustChangePassword: boolean; teacherId: number | null; studentId: number | null; permissions: string[];
}
interface School { name: string; nameHi: string | null; logoFileId: string | null; defaultLanguage: 'en' | 'hi'; allowAdmissionNoLogin: boolean; allowRollLogin: boolean }
interface AuthCtx { user: User | null; school: School | null; loading: boolean; refresh: () => Promise<User | null>; logout: () => Promise<void>; can: (p: string) => boolean }

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(true);
  const { setLang } = useI18n();
  const refresh = useCallback(async () => {
    try {
      const me = await api.get('/api/auth/me');
      setCsrf(me.csrfToken);
      setUser(me.user);
      setSchool(me.school);
      if (me.school?.name) document.title = me.school.name;
      return me.user as User | null;
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { refresh().catch(() => setLoading(false)); }, [refresh]);
  useEffect(() => { if (user?.preferredLanguage) setLang(user.preferredLanguage); }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const logout = async () => {
    await api.post('/api/auth/logout').catch(() => {});
    setUser(null);
    await refresh();
  };
  const can = (p: string) => !!user && (user.role === 'admin' || user.permissions.includes(p));
  return <Ctx.Provider value={{ user, school, loading, refresh, logout, can }}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);

export function homeFor(u: User | null) {
  if (!u) return '/login';
  if (u.mustChangePassword) return '/change-password';
  if (u.role === 'teacher') return '/teacher';
  if (u.role === 'student') return '/student';
  return '/admin';
}
