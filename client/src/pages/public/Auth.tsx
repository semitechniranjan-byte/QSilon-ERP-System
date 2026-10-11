import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { api } from '../../lib/api';
import { homeFor, useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import { Field, Loading } from '../../components/ui';
import { LangToggle } from '../../components/LangToggle';
import { SchoolLogo } from '../../components/PublicLayout';

function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  const { school } = useAuth();
  const { pick } = useI18n();
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-800 to-brand-600 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-white">
            <SchoolLogo fileId={school?.logoFileId} name={school?.name ?? 'S'} className="h-10 w-10" />
            <span className="font-semibold">{school ? pick(school.name, school.nameHi) : ''}</span>
          </Link>
          <LangToggle />
        </div>
        <div className="card p-6 sm:p-8">
          <h1 className="mb-6 flex items-center gap-2 text-xl font-semibold"><Lock className="h-5 w-5 text-brand-600" />{title}</h1>
          {children}
        </div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { t } = useI18n();
  const { user, school, refresh, loading } = useAuth();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [identifier, setId] = useState('');
  const [password, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  useEffect(() => { api.get('/api/setup/status').then((s) => setNeedsSetup(s.needsSetup)).catch(() => {}); }, []);
  if (loading) return <Loading />;
  if (user) return <Navigate to={homeFor(user)} replace />;
  const hints = ['Teacher ID / Student ID'];
  if (school?.allowAdmissionNoLogin) hints.push('admission number');
  if (school?.allowRollLogin) hints.push('CLASS-SECTION-ROLL (e.g. 5-A-12)');
  return (
    <AuthShell title={t('Sign in')}>
      {needsSetup && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">No administrator exists yet. <Link to="/setup" className="link">Complete first-time setup</Link>.</p>}
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setErr('');
        try {
          await api.post('/api/auth/login', { identifier, password });
          const u = await refresh();
          const next = sp.get('next');
          nav(u?.mustChangePassword ? '/change-password' : next && next.startsWith('/') && !next.startsWith('//') ? next : homeFor(u), { replace: true });
        } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
      }}>
        <Field label={t('User ID')} hint={hints.join(', or ')}><input className="input" autoComplete="username" required value={identifier} onChange={(e) => setId(e.target.value)} autoFocus /></Field>
        <Field label={t('Password')}><input type="password" className="input" autoComplete="current-password" required value={password} onChange={(e) => setPw(e.target.value)} /></Field>
        {err && <p className="text-sm text-red-600" role="alert">{err}</p>}
        <button className="btn-primary w-full" disabled={busy}>{t('Sign in')}</button>
        <div className="flex justify-between text-sm"><Link to="/forgot-password" className="link">{t('Forgot password?')}</Link><Link to="/" className="text-slate-500 hover:underline">{t('Home')}</Link></div>
      </form>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const { t } = useI18n();
  const [identifier, setId] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  return (
    <AuthShell title={t('Forgot password?')}>
      {msg ? <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{msg}</p> : (
        <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); setErr(''); try { setMsg((await api.post('/api/auth/forgot', { identifier })).message); } catch (x: any) { setErr(x.message); } }}>
          <p className="text-sm text-slate-600">Enter your ID. The school office will verify your identity and issue a temporary password.</p>
          <Field label={t('User ID')}><input className="input" required value={identifier} onChange={(e) => setId(e.target.value)} /></Field>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button className="btn-primary w-full">{t('Submit')}</button>
        </form>
      )}
      <Link to="/login" className="link mt-4 inline-block text-sm">← {t('Sign in')}</Link>
    </AuthShell>
  );
}

export function ChangePasswordPage() {
  const { t } = useI18n();
  const { user, refresh, loading } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <AuthShell title={t('Change password')}>
      {user.mustChangePassword && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">You are using a temporary password. Please choose a new password to continue.</p>}
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault(); setErr('');
        if (f.newPassword !== f.confirm) return setErr('The new passwords do not match.');
        setBusy(true);
        try { await api.post('/api/auth/change-password', { currentPassword: f.currentPassword, newPassword: f.newPassword }); const u = await refresh(); nav(homeFor(u), { replace: true }); }
        catch (x: any) { setErr(x.message); } finally { setBusy(false); }
      }}>
        <Field label={t('Current password')}><input type="password" className="input" autoComplete="current-password" required value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} /></Field>
        <Field label={t('New password')} hint="At least 8 characters with letters and numbers."><input type="password" className="input" autoComplete="new-password" required minLength={8} value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} /></Field>
        <Field label={t('Confirm new password')}><input type="password" className="input" autoComplete="new-password" required value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} /></Field>
        {err && <p className="text-sm text-red-600" role="alert">{err}</p>}
        <button className="btn-primary w-full" disabled={busy}>{t('Save')}</button>
        {!user.mustChangePassword && <Link to={homeFor(user)} className="link block text-center text-sm">{t('Cancel')}</Link>}
      </form>
    </AuthShell>
  );
}

export function SetupPage() {
  const nav = useNavigate();
  const [status, setStatus] = useState<{ needsSetup: boolean; setupEnabled: boolean } | null>(null);
  const [f, setF] = useState({ token: '', schoolName: '', displayName: '', username: '', password: '' });
  const [err, setErr] = useState('');
  useEffect(() => { api.get('/api/setup/status').then(setStatus); }, []);
  if (!status) return <Loading />;
  if (!status.needsSetup) return <Navigate to="/login" replace />;
  return (
    <AuthShell title="First-time setup">
      {!status.setupEnabled ? (
        <p className="text-sm text-slate-600">Setup through the browser is disabled. Set the <code>SETUP_TOKEN</code> environment variable on the server (Render → Environment), or run <code>npm run create-admin</code> from the Render Shell.</p>
      ) : (
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault(); setErr('');
          try { await api.post('/api/setup', f); nav('/login'); } catch (x: any) { setErr(x.message); }
        }}>
          <Field label="Setup token" hint="The SETUP_TOKEN value from the server's environment settings."><input className="input" type="password" required value={f.token} onChange={(e) => setF({ ...f, token: e.target.value })} /></Field>
          <Field label="School name"><input className="input" required value={f.schoolName} onChange={(e) => setF({ ...f, schoolName: e.target.value })} /></Field>
          <Field label="Principal / administrator name"><input className="input" required value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} /></Field>
          <Field label="Administrator user ID"><input className="input" required pattern="[A-Za-z0-9._\-]{3,40}" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></Field>
          <Field label="Password" hint="At least 8 characters with letters and numbers."><input className="input" type="password" required minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button className="btn-primary w-full">Create administrator</button>
        </form>
      )}
    </AuthShell>
  );
}
