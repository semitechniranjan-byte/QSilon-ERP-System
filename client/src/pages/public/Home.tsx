import { Link } from 'react-router-dom';
import { ArrowRight, BedDouble, BookOpen, Bus, CalendarDays, FlaskConical, GraduationCap, Languages, Library, Megaphone, Music, Palette, Shield, Star, Trophy, Users, Baby, Monitor, Mail, MapPin, Phone } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { usePublicSite } from '../../components/PublicLayout';
import { Loading, ErrorState } from '../../components/ui';
import { fmtDate } from '../../lib/format';
import { EnquiryForm } from './Enquiry';

export const ICONS: Record<string, any> = { star: Star, book: BookOpen, library: Library, lab: FlaskConical, sports: Trophy, music: Music, art: Palette, computer: Monitor, bus: Bus, hostel: BedDouble, security: Shield, language: Languages };

export function Paragraphs({ text, className = '' }: { text?: string | null; className?: string }) {
  if (!text) return null;
  return <div className={`space-y-3 ${className}`}>{text.split(/\n\s*\n/).map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}</div>;
}

export default function Home() {
  const { t, pick } = useI18n();
  const q = usePublicSite();
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <div className="p-8"><ErrorState error={q.error} /></div>;
  const { school: s, stats, facilities, notices, events, classes, boards, mediums, routes, hostels, pages } = q.data;
  const page = (k: string) => pages.find((p) => p.key === k);
  const preschool = classes.filter((c) => c.is_preschool);
  const school = classes.filter((c) => !c.is_preschool);
  const statItems = stats ? [
    [t('Students enrolled'), stats.students, Users], [t('Teachers'), stats.teachers, GraduationCap],
    [t('Classes offered'), stats.classes, BookOpen], [t('Years of excellence'), stats.yearsExperience, Trophy],
  ].filter(([, v]) => v != null && v !== 0) : [];
  return (
    <>
      <section className="relative overflow-hidden bg-brand-800 text-white">
        {s.heroImageFileId && <img src={`/api/files/${s.heroImageFileId}`} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />}
        <div className="absolute inset-0 bg-gradient-to-br from-brand-900/90 via-brand-800/80 to-brand-600/60" />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:py-24 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-accent-400 ring-1 ring-white/20">{t('From Playgroup to Class 12')}</p>
            <h1 className="text-3xl font-bold leading-tight sm:text-5xl">{pick(s.name, s.nameHi)}</h1>
            {s.tagline && <p className="mt-4 text-lg text-brand-100">{pick(s.tagline, s.taglineHi)}</p>}
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/admission" className="btn bg-accent-500 text-brand-900 hover:bg-accent-400">{t('Apply for Admission')} <ArrowRight className="h-4 w-4" /></Link>
              <Link to="/about" className="btn border border-white/40 text-white hover:bg-white/10">{t('Read more')}</Link>
            </div>
          </div>
          {statItems.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {statItems.map(([label, value, Icon]: any) => (
                <div key={label} className="rounded-2xl bg-white/10 p-5 ring-1 ring-white/15 backdrop-blur">
                  <Icon className="h-6 w-6 text-accent-400" />
                  <p className="mt-3 text-3xl font-bold">{value}{typeof value === 'number' && label === t('Years of excellence') ? '+' : ''}</p>
                  <p className="text-sm text-brand-100">{label}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-16 lg:grid-cols-2">
        <div>
          <h2 className="text-2xl font-semibold text-brand-900">{t('Welcome to')} {pick(s.name, s.nameHi)}</h2>
          <Paragraphs text={pick(s.about, s.aboutHi) || page('about')?.body} className="mt-4 text-slate-600" />
          {s.principalName && <p className="mt-4 text-sm text-slate-500">— {s.principalName}</p>}
        </div>
        {(s.mission || s.missionHi) && (
          <div className="rounded-2xl bg-brand-50 p-6">
            <h3 className="font-semibold text-brand-800">{t('Our Mission')}</h3>
            <Paragraphs text={pick(s.mission, s.missionHi)} className="mt-3 text-slate-700" />
          </div>
        )}
      </section>

      <section className="bg-slate-50 py-16">
        <div className="mx-auto max-w-7xl px-4">
          <h2 className="text-2xl font-semibold text-brand-900">{t('Academics')}</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            <Link to="/preschool" className="card p-6 transition hover:shadow-md">
              <Baby className="h-8 w-8 text-accent-500" />
              <h3 className="mt-3 font-semibold">{t('Preschool')}</h3>
              <p className="mt-2 text-sm text-slate-600">{preschool.map((c) => pick(c.name, c.name_hi)).join(' · ') || '—'}</p>
            </Link>
            <Link to="/academics" className="card p-6 transition hover:shadow-md">
              <BookOpen className="h-8 w-8 text-brand-600" />
              <h3 className="mt-3 font-semibold">{t('Classes')}</h3>
              <p className="mt-2 text-sm text-slate-600">{school.length ? `${pick(school[0].name, school[0].name_hi)} – ${pick(school[school.length - 1].name, school[school.length - 1].name_hi)}` : '—'}</p>
            </Link>
            <div className="card p-6">
              <Languages className="h-8 w-8 text-emerald-600" />
              <h3 className="mt-3 font-semibold">{t('Boards & Medium')}</h3>
              <p className="mt-2 text-sm text-slate-600">{boards.map((b) => b.code).join(' · ')}</p>
              <p className="text-sm text-slate-600">{mediums.map((m) => m.name).join(' · ')}</p>
            </div>
          </div>
        </div>
      </section>

      {facilities.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-16">
          <h2 className="text-2xl font-semibold text-brand-900">{t('Facilities')}</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {facilities.map((f) => { const Icon = ICONS[f.icon] ?? Star; return (
              <div key={f.id} className="card p-5">
                <Icon className="h-6 w-6 text-brand-600" />
                <h3 className="mt-3 font-medium">{pick(f.title, f.title_hi)}</h3>
                <p className="mt-1 text-sm text-slate-600">{pick(f.description, f.description_hi)}</p>
              </div>
            ); })}
          </div>
        </section>
      )}

      <section className="bg-brand-50 py-16">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 md:grid-cols-2">
          <Link to="/hostel" className="card flex gap-4 p-6 transition hover:shadow-md">
            <BedDouble className="h-8 w-8 shrink-0 text-brand-600" />
            <div><h3 className="font-semibold">{t('Hostel')}</h3>
              <p className="mt-1 text-sm text-slate-600">{hostels.length ? hostels.map((h) => h.name).join(', ') : (page('hostel')?.body?.slice(0, 160) || '—')}</p></div>
          </Link>
          <div className="card flex gap-4 p-6">
            <Bus className="h-8 w-8 shrink-0 text-brand-600" />
            <div><h3 className="font-semibold">{t('Transport')}</h3>
              <p className="mt-1 text-sm text-slate-600">{routes.length ? routes.map((r) => r.name).join(', ') : (page('transport')?.body?.slice(0, 160) || '—')}</p></div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-16 lg:grid-cols-2">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-brand-900"><Megaphone className="h-5 w-5" />{t('Latest Notices')}</h2>
          <ul className="mt-4 divide-y rounded-xl border bg-white">
            {notices.slice(0, 5).map((n) => (
              <li key={n.id} className="p-4"><Link to="/notices" className="font-medium text-slate-800 hover:text-brand-700">{pick(n.title, n.title_hi)}</Link>
                <p className="text-xs text-slate-500">{fmtDate(n.publish_at)}</p></li>
            ))}
            {!notices.length && <li className="p-4 text-sm text-slate-500">—</li>}
          </ul>
        </div>
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-brand-900"><CalendarDays className="h-5 w-5" />{t('Upcoming Events')}</h2>
          <ul className="mt-4 divide-y rounded-xl border bg-white">
            {events.slice(0, 5).map((e) => (
              <li key={e.id} className="flex gap-4 p-4">
                <div className="w-14 shrink-0 rounded-lg bg-brand-50 py-1 text-center"><p className="text-lg font-bold text-brand-700">{e.start_date.slice(8, 10)}</p><p className="text-[10px] uppercase text-brand-600">{new Date(e.start_date).toLocaleString('en', { month: 'short' })}</p></div>
                <div><p className="font-medium">{pick(e.title, e.title_hi)}</p>{e.location && <p className="text-xs text-slate-500">{e.location}</p>}</div>
              </li>
            ))}
            {!events.length && <li className="p-4 text-sm text-slate-500">—</li>}
          </ul>
        </div>
      </section>

      <section id="enquiry" className="bg-slate-50 py-16">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold text-brand-900">{t('Get in touch')}</h2>
            <div className="mt-6 space-y-3 text-slate-700">
              {s.address && <p className="flex gap-3"><MapPin className="h-5 w-5 shrink-0 text-brand-600" />{[s.address, s.city, s.state, s.pincode].filter(Boolean).join(', ')}</p>}
              {s.phone && <p className="flex gap-3"><Phone className="h-5 w-5 text-brand-600" /><a href={`tel:${s.phone}`}>{s.phone}</a></p>}
              {s.email && <p className="flex gap-3"><Mail className="h-5 w-5 text-brand-600" /><a href={`mailto:${s.email}`}>{s.email}</a></p>}
              {s.mapUrl && <a className="link inline-block" href={s.mapUrl} target="_blank" rel="noopener noreferrer">{t('Open map')} →</a>}
            </div>
          </div>
          {s.enquiryEnabled && <div className="card p-6"><h3 className="mb-4 font-semibold">{t('Admission Enquiry')}</h3><EnquiryForm classes={classes} /></div>}
        </div>
      </section>
    </>
  );
}
