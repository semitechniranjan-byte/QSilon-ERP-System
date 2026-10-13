import { useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Clock, Mail, MapPin, Menu, Phone, X } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { useApi } from './ui';
import { LangToggle } from './LangToggle';
import { useAuth, homeFor } from '../lib/auth';

export interface PublicSite { school: any; stats: any; pages: any[]; facilities: any[]; gallery: any[]; notices: any[]; events: any[]; classes: any[]; boards: any[]; mediums: any[]; routes: any[]; hostels: any[] }
export const usePublicSite = () => useApi<PublicSite>('/api/public/site');

export function SchoolLogo({ fileId, name, className = 'h-10 w-10' }: { fileId?: string | null; name: string; className?: string }) {
  if (fileId) return <img src={`/api/files/${fileId}`} alt={`${name} logo`} className={`${className} rounded-lg object-contain`} />;
  return (
    <div className={`${className} flex items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 font-bold text-white shadow-sm ring-2 ring-accent-400/60`} aria-hidden>
      {name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('')}
    </div>
  );
}

/** Compact two-line school name for the header so long names never squeeze the menu. */
export function BrandName({ name, className = 'text-brand-800' }: { name: string; className?: string }) {
  const words = name.split(/\s+/).filter(Boolean);
  const cut = words.length > 2 ? Math.ceil(words.length / 2) : words.length;
  const [a, b] = [words.slice(0, cut).join(' '), words.slice(cut).join(' ')];
  return (
    <span className={`min-w-0 whitespace-nowrap text-sm font-bold leading-tight ${className}`} title={name}>
      <span className="block">{a}</span>{b && <span className="block text-xs font-semibold opacity-80">{b}</span>}
    </span>
  );
}

const NAV = [
  ['/', 'Home'], ['/about', 'About Us'], ['/academics', 'Academics'], ['/preschool', 'Preschool'], ['/hostel', 'Hostel'],
  ['/facilities', 'Facilities'], ['/gallery', 'Gallery'], ['/notices', 'Notices'], ['/contact', 'Contact Us'],
] as const;

export function PublicLayout({ children }: { children?: ReactNode }) {
  const { t, pick } = useI18n();
  const { data } = usePublicSite();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const s = data?.school;
  const name = s ? pick(s.name, s.nameHi) : '';
  const hasPreschool = !!data?.classes.some((c) => c.is_preschool);
  const nav = NAV.filter(([to]) => to !== '/preschool' || hasPreschool);
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            {s && <SchoolLogo fileId={s.logoFileId} name={s.name} className="h-10 w-10 shrink-0" />}
            <BrandName name={name} />
          </Link>
          <nav className="hidden items-center gap-0.5 xl:flex" aria-label="Main">
            {nav.map(([to, label]) => (
              <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `whitespace-nowrap rounded-md px-2 py-1.5 text-sm ${isActive ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-600 hover:text-brand-700'}`}>{t(label)}</NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <LangToggle className="hidden sm:inline-flex" />
            <Link to="/admission" className="btn-secondary btn-sm hidden whitespace-nowrap md:inline-flex xl:hidden 2xl:inline-flex">{t('Admission Enquiry')}</Link>
            <Link to={user ? homeFor(user) : '/login'} className="btn-primary btn-sm">{user ? t('Dashboard') : t('Login')}</Link>
            <button className="btn-ghost p-2 xl:hidden" onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}>{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
          </div>
        </div>
        {open && (
          <nav className="border-t border-slate-100 px-4 pb-4 xl:hidden" aria-label="Mobile">
            <div className="grid grid-cols-2 gap-1 pt-2">
              {[...nav, ['/admission', 'Admission Enquiry'] as const].map(([to, label]) => (
                <NavLink key={to} to={to} end={to === '/'} onClick={() => setOpen(false)} className={({ isActive }) => `rounded-md px-3 py-2 text-sm ${isActive ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-700'}`}>{t(label)}</NavLink>
              ))}
            </div>
            <LangToggle className="mt-3" />
          </nav>
        )}
      </header>
      <main className="flex-1">{children ?? <Outlet />}</main>
      <footer className="border-t border-brand-100 bg-brand-50 text-slate-600">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-3">
          <div>
            <p className="text-lg font-semibold text-brand-900">{name}</p>
            {s?.tagline && <p className="mt-1 text-sm text-slate-500">{pick(s.tagline, s.taglineHi)}</p>}
          </div>
          <div className="space-y-2 text-sm">
            {s?.address && <p className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{[s.address, s.city, s.state, s.pincode].filter(Boolean).join(', ')}</p>}
            {s?.phone && <p className="flex gap-2"><Phone className="h-4 w-4" /><a href={`tel:${s.phone}`} className="hover:text-brand-700">{s.phone}</a></p>}
            {s?.email && <p className="flex gap-2"><Mail className="h-4 w-4" /><a href={`mailto:${s.email}`} className="hover:text-brand-700">{s.email}</a></p>}
            {s?.schoolHours && <p className="flex gap-2"><Clock className="h-4 w-4" />{pick(s.schoolHours, s.schoolHoursHi)}</p>}
          </div>
          <div className="grid grid-cols-2 gap-1 text-sm">
            {nav.slice(1).map(([to, label]) => <Link key={to} to={to} className="hover:text-brand-700">{t(label)}</Link>)}
            <Link to="/admission" className="hover:text-brand-700">{t('Admission Enquiry')}</Link>
            <Link to="/login" className="hover:text-brand-700">{t('Login')}</Link>
          </div>
        </div>
        <div className="border-t border-brand-100 py-4 text-center text-xs text-slate-500">© {new Date().getFullYear()} {name}</div>
      </footer>
    </div>
  );
}
