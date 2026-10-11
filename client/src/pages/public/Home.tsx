import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Award, Baby, BedDouble, BookOpen, Bus, CalendarDays, Clock, FlaskConical, GraduationCap, HeartHandshake, Languages, Library, Mail, MapPin,
  Camera, ChevronLeft, ChevronRight, Megaphone, Monitor, Music, Palette, Phone, Shield, Star, Trophy, Users,
} from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { usePublicSite } from '../../components/PublicLayout';
import { Loading, ErrorState } from '../../components/ui';
import { SchoolIllustration } from '../../components/SchoolIllustration';
import { fmtDate } from '../../lib/format';
import { EnquiryForm } from './Enquiry';

export const ICONS: Record<string, any> = { star: Star, book: BookOpen, library: Library, lab: FlaskConical, sports: Trophy, music: Music, art: Palette, computer: Monitor, bus: Bus, hostel: BedDouble, security: Shield, language: Languages };

export function Paragraphs({ text, className = '' }: { text?: string | null; className?: string }) {
  if (!text) return null;
  return <div className={`space-y-3 ${className}`}>{text.split(/\n\s*\n/).map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}</div>;
}
/** Hero visual: rotating school photos (homepage image + gallery), or an illustrated campus until photos are uploaded. */
function HeroVisual({ photos, initials, caption }: { photos: { id: number; title: string }[]; initials: string; caption: string }) {
  const { lang } = useI18n();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (photos.length < 2) return;
    const h = setInterval(() => setI((x) => (x + 1) % photos.length), 5000);
    return () => clearInterval(h);
  }, [photos.length]);
  if (!photos.length) {
    return (
      <div className="relative mx-auto w-full max-w-xl">
        <div className="absolute -inset-3 rotate-2 rounded-[2rem] bg-accent-400/80" aria-hidden />
        <SchoolIllustration initials={initials} className="relative w-full rounded-[1.75rem] shadow-2xl ring-4 ring-white/20" />
        <div className="absolute -bottom-5 left-3 flex items-center sm:-left-5 gap-3 rounded-2xl bg-white px-4 py-3 text-slate-800 shadow-xl">
          <div className="rounded-xl bg-accent-400/20 p-2 text-accent-600"><GraduationCap className="h-5 w-5" /></div>
          <div><p className="text-sm font-semibold leading-tight">{caption}</p><p className="text-xs text-slate-500">{lang === 'hi' ? 'दैनिक विद्यार्थी एवं छात्रावासी' : 'Day scholars & hostellers'}</p></div>
        </div>
      </div>
    );
  }
  const go = (d: number) => setI((x) => (x + d + photos.length) % photos.length);
  return (
    <div className="relative mx-auto w-full max-w-xl">
      <div className="absolute -inset-3 rotate-2 rounded-[2rem] bg-accent-400/80" aria-hidden />
      <div className="relative aspect-[4/3] overflow-hidden rounded-[1.75rem] shadow-2xl ring-4 ring-white/20">
        {photos.map((p, k) => (
          <img key={p.id} src={`/api/files/${p.id}`} alt={p.title} loading={k ? 'lazy' : 'eager'}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${k === i ? 'opacity-100' : 'opacity-0'}`} />
        ))}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-4 pt-10">
          <p className="text-sm font-medium text-white">{photos[i].title}</p>
        </div>
        {photos.length > 1 && <>
          <button type="button" onClick={() => go(-1)} aria-label="Previous photo" className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-1.5 text-slate-800 hover:bg-white"><ChevronLeft className="h-5 w-5" /></button>
          <button type="button" onClick={() => go(1)} aria-label="Next photo" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-1.5 text-slate-800 hover:bg-white"><ChevronRight className="h-5 w-5" /></button>
          <div className="absolute bottom-3 right-4 flex gap-1.5">{photos.map((p, k) => <button type="button" key={p.id} onClick={() => setI(k)} aria-label={`Photo ${k + 1}`} className={`h-2 rounded-full transition-all ${k === i ? 'w-6 bg-white' : 'w-2 bg-white/60'}`} />)}</div>
        </>}
      </div>
    </div>
  );
}

const firstPara = (t?: string | null) => (t ?? '').split(/\n\s*\n/)[0];

export default function Home() {
  const { t, pick, lang } = useI18n();
  const q = usePublicSite();
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <div className="p-8"><ErrorState error={q.error} /></div>;
  const { school: s, stats, facilities, gallery, notices, events, classes, boards, mediums, routes, hostels, pages } = q.data;
  const page = (k: string) => pages.find((p) => p.key === k);
  const pageText = (k: string) => { const p = page(k); return p ? pick(p.body, p.body_hi) : ''; };
  const preschool = classes.filter((c) => c.is_preschool);
  const school = classes.filter((c) => !c.is_preschool);
  const statItems = (stats ? [
    [t('Students enrolled'), stats.students, Users], [t('Teachers'), stats.teachers, GraduationCap],
    [t('Classes offered'), stats.classes, BookOpen], [t('Years of excellence'), stats.yearsExperience, Trophy],
  ] : []).filter(([, v]) => v != null && Number(v) > 0) as [string, number, any][];
  const name = pick(s.name, s.nameHi);
  const initials = (s.name ?? '').split(/\s+/).filter(Boolean).map((w: string) => w[0]).join('').toUpperCase().slice(0, 5);
  const photos = [
    ...(s.heroImageFileId ? [{ id: s.heroImageFileId, title: name }] : []),
    ...(gallery ?? []).filter((g: any) => g.file_id !== s.heroImageFileId).map((g: any) => ({ id: g.file_id, title: pick(g.title, g.title_hi) })),
  ].slice(0, 6);
  const range = classes.length ? `${pick(classes[0].name, classes[0].name_hi)} – ${pick(classes[classes.length - 1].name, classes[classes.length - 1].name_hi)}` : '';
  const rangeTo = classes.length ? (lang === 'hi' ? `${pick(classes[0].name, classes[0].name_hi)} से ${pick(classes[classes.length - 1].name, classes[classes.length - 1].name_hi)} तक` : `${classes[0].name} to ${classes[classes.length - 1].name}`) : '';
  const hours = pick(s.schoolHours, s.schoolHoursHi);
  const highlights = [
    [Award, boards.map((b) => b.code).join(' & ') || 'CBSE', lang === 'hi' ? 'मान्यता प्राप्त पाठ्यक्रम' : 'Recognised curriculum'],
    [Languages, mediums.map((m) => m.name).join(' & ') || 'English', lang === 'hi' ? 'शिक्षण माध्यम' : 'Medium of instruction'],
    [BookOpen, range, lang === 'hi' ? 'सभी कक्षाएँ' : 'All classes under one roof'],
    [Clock, hours || '9:00 – 4:00', lang === 'hi' ? 'विद्यालय समय' : 'School timings'],
  ] as [any, string, string][];
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-brand-800 text-white">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-900 via-brand-800/95 to-brand-600/80" />
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent-400/20 blur-3xl" aria-hidden />
        <div className="absolute -bottom-32 left-10 h-72 w-72 rounded-full bg-brand-400/30 blur-3xl" aria-hidden />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:py-20 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-accent-400 ring-1 ring-white/20">
              <Star className="h-3.5 w-3.5" />{lang === 'hi' ? `प्रवेश प्रारंभ · ${rangeTo}` : `Admissions open · ${rangeTo}`}</p>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl xl:text-6xl">{name}</h1>
            {s.tagline && <p className="mt-4 max-w-xl text-lg text-brand-100">{pick(s.tagline, s.taglineHi)}</p>}
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/admission" className="btn bg-accent-500 px-5 py-2.5 text-brand-900 hover:bg-accent-400">{t('Apply for Admission')} <ArrowRight className="h-4 w-4" /></Link>
              <Link to="/about" className="btn border border-white/40 px-5 py-2.5 text-white hover:bg-white/10">{t('Read more')}</Link>
            </div>
            {statItems.length > 0 && (
              <dl className="mt-10 flex max-w-xl flex-wrap gap-3">
                {statItems.map(([label, value, Icon]) => (
                  <div key={label} className="flex min-w-[9rem] flex-1 items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/15 backdrop-blur">
                    <Icon className="h-6 w-6 shrink-0 text-accent-400" />
                    <div><dd className="text-2xl font-bold leading-none text-white">{value}{label === t('Years of excellence') ? '+' : ''}</dd><dt className="mt-1 text-xs text-brand-100">{label}</dt></div>
                  </div>
                ))}
              </dl>
            )}
          </div>
          <div className="pb-6 lg:pb-0"><HeroVisual photos={photos} initials={initials} caption={rangeTo} /></div>
        </div>
      </section>

      {/* Highlights strip */}
      <section className="relative z-10 mx-auto -mt-8 max-w-6xl px-4">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-slate-200 shadow-lg ring-1 ring-slate-200 md:grid-cols-4">
          {highlights.map(([Icon, title, sub]) => (
            <div key={sub} className="flex items-center gap-3 bg-white p-4 sm:p-5">
              <div className="rounded-xl bg-brand-50 p-2.5 text-brand-600"><Icon className="h-5 w-5" /></div>
              <div className="min-w-0"><p className="text-sm font-semibold leading-snug text-slate-900">{title}</p><p className="text-xs text-slate-500">{sub}</p></div>
            </div>
          ))}
        </div>
      </section>

      {/* About + mission */}
      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-16 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <p className="text-sm font-semibold uppercase tracking-wider text-accent-600">{t('About Us')}</p>
          <h2 className="mt-1 text-2xl font-semibold text-brand-900 sm:text-3xl">{t('Welcome to')} {name}</h2>
          <Paragraphs text={pick(s.about, s.aboutHi) || pageText('about')} className="mt-4 text-slate-600" />
          <Link to="/about" className="link mt-4 inline-flex items-center gap-1">{t('Read more')} <ArrowRight className="h-4 w-4" /></Link>
        </div>
        <div className="space-y-4 lg:col-span-2">
          {(s.mission || s.missionHi) && (
            <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 p-6 text-white shadow-md">
              <HeartHandshake className="h-7 w-7 text-accent-400" />
              <h3 className="mt-3 font-semibold">{t('Our Mission')}</h3>
              <Paragraphs text={pick(s.mission, s.missionHi)} className="mt-2 text-brand-100" />
            </div>
          )}
          {s.principalName && <div className="rounded-2xl border border-slate-200 p-5"><p className="text-sm text-slate-500">{lang === 'hi' ? 'प्रधानाचार्य' : 'Principal'}</p><p className="font-semibold text-slate-800">{s.principalName}</p></div>}
        </div>
      </section>

      {/* Programmes */}
      <section className="bg-slate-50 py-16">
        <div className="mx-auto max-w-7xl px-4">
          <p className="text-sm font-semibold uppercase tracking-wider text-accent-600">{t('Academics')}</p>
          <h2 className="mt-1 text-2xl font-semibold text-brand-900 sm:text-3xl">{lang === 'hi' ? 'हमारे कार्यक्रम' : 'Our programmes'}</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              ...(preschool.length ? [{ to: '/preschool', Icon: Baby, color: 'text-accent-500 bg-accent-400/15', title: t('Preschool'), sub: preschool.map((c) => pick(c.name, c.name_hi)).join(' · '), text: firstPara(pageText('preschool')) }] : []),
              { to: '/academics', Icon: BookOpen, color: 'text-brand-600 bg-brand-50', title: lang === 'hi' ? 'शैक्षणिक' : 'Academics', sub: school.length ? `${pick(school[0].name, school[0].name_hi)} – ${pick(school[school.length - 1].name, school[school.length - 1].name_hi)}` : '', text: firstPara(pageText('academics')) },
              ...(!preschool.length ? [{ to: '/academics', Icon: Clock, color: 'text-emerald-600 bg-emerald-50', title: lang === 'hi' ? 'दैनिक विद्यार्थी' : 'Day Scholars', sub: hours, text: lang === 'hi' ? 'दैनिक विद्यार्थी सुबह से शाम तक विद्यालय में पढ़ाई, खेल और गतिविधियों में भाग लेकर घर लौटते हैं। सुरक्षित बस सुविधा उपलब्ध है।' : 'Day scholars spend the school day learning, playing and taking part in activities, and return home in the evening. Safe school transport is available on major routes.' }] : []),
              { to: '/hostel', Icon: BedDouble, color: 'text-violet-600 bg-violet-50', title: lang === 'hi' ? 'छात्रावास एवं परिवहन' : 'Hostel & Transport', sub: [hostels.length ? `${hostels.length} ${lang === 'hi' ? 'छात्रावास' : 'hostel(s)'}` : '', routes.length ? `${routes.length} ${lang === 'hi' ? 'बस मार्ग' : 'bus routes'}` : ''].filter(Boolean).join(' · '), text: firstPara(pageText('hostel')) || firstPara(pageText('transport')) },
            ].map(({ to, Icon, color, title, sub, text }) => (
              <Link key={title} to={to} className="group card flex flex-col p-6 transition hover:-translate-y-0.5 hover:shadow-lg">
                <div className={`w-fit rounded-xl p-3 ${color}`}><Icon className="h-6 w-6" /></div>
                <h3 className="mt-4 text-lg font-semibold">{title}</h3>
                {sub && <p className="text-sm font-medium text-slate-500">{sub}</p>}
                {text && <p className="mt-3 line-clamp-4 text-sm text-slate-600">{text}</p>}
                <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-medium text-brand-600 group-hover:gap-2">{t('Read more')} <ArrowRight className="h-4 w-4" /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Facilities */}
      {facilities.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-16">
          <p className="text-sm font-semibold uppercase tracking-wider text-accent-600">{t('Facilities')}</p>
          <h2 className="mt-1 text-2xl font-semibold text-brand-900 sm:text-3xl">{lang === 'hi' ? 'हमें क्यों चुनें' : 'Why parents choose us'}</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {facilities.map((f) => { const Icon = ICONS[f.icon] ?? Star; return (
              <div key={f.id} className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-brand-200 hover:shadow-md">
                <div className="w-fit rounded-xl bg-brand-50 p-2.5 text-brand-600"><Icon className="h-5 w-5" /></div>
                <h3 className="mt-3 font-semibold">{pick(f.title, f.title_hi)}</h3>
                <p className="mt-1 text-sm text-slate-600">{pick(f.description, f.description_hi)}</p>
              </div>
            ); })}
          </div>
        </section>
      )}

      {/* Campus photos */}
      {(gallery ?? []).length > 0 && (
        <section className="bg-slate-50 py-16">
          <div className="mx-auto max-w-7xl px-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><p className="text-sm font-semibold uppercase tracking-wider text-accent-600">{t('Gallery')}</p>
                <h2 className="mt-1 text-2xl font-semibold text-brand-900 sm:text-3xl">{lang === 'hi' ? 'विद्यालय की झलक' : 'Life at our campus'}</h2></div>
              <Link to="/gallery" className="link inline-flex items-center gap-1"><Camera className="h-4 w-4" />{lang === 'hi' ? 'सभी फ़ोटो' : 'View all photos'}</Link>
            </div>
            <div className="mt-8 grid auto-rows-[10rem] grid-cols-2 gap-3 sm:auto-rows-[12rem] md:grid-cols-4">
              {(gallery ?? []).slice(0, 7).map((g: any, k: number) => (
                <Link to="/gallery" key={g.id} className={`group relative overflow-hidden rounded-2xl bg-slate-200 ${k === 0 ? 'col-span-2 row-span-2' : ''}`}>
                  <img src={`/api/files/${g.file_id}`} alt={pick(g.title, g.title_hi)} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3 text-sm font-medium text-white opacity-0 transition group-hover:opacity-100">{pick(g.title, g.title_hi)}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Admissions CTA */}
      <section className="mx-auto max-w-7xl px-4 py-12">
        <div className="flex flex-col items-start justify-between gap-4 rounded-2xl bg-gradient-to-r from-accent-500 to-accent-400 p-8 text-brand-900 sm:flex-row sm:items-center">
          <div><h2 className="text-2xl font-bold">{lang === 'hi' ? 'नए सत्र के लिए प्रवेश प्रारंभ' : 'Admissions are open for the new session'}</h2>
            <p className="mt-1 text-brand-900/80">{lang === 'hi' ? `${rangeTo} — दैनिक विद्यार्थी एवं छात्रावास, आज ही पूछताछ करें।` : `${rangeTo} · day scholars and hostel residents — send an enquiry and we will call you back.`}</p></div>
          <Link to="/admission" className="btn bg-brand-800 px-5 py-2.5 text-white hover:bg-brand-900">{t('Admission Enquiry')} <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>

      {/* Notices & events */}
      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-16 lg:grid-cols-2">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-brand-900"><Megaphone className="h-5 w-5 text-accent-600" />{t('Latest Notices')}</h2>
          <ul className="mt-4 divide-y rounded-2xl border bg-white">
            {notices.slice(0, 5).map((n) => (
              <li key={n.id} className="p-4"><Link to="/notices" className="font-medium text-slate-800 hover:text-brand-700">{n.pinned && '📌 '}{pick(n.title, n.title_hi)}</Link>
                <p className="text-xs text-slate-500">{fmtDate(n.publish_at)}</p></li>
            ))}
            {!notices.length && <li className="p-6 text-center text-sm text-slate-500">{lang === 'hi' ? 'अभी कोई सूचना नहीं है।' : 'No notices at the moment. Please check back soon.'}</li>}
          </ul>
        </div>
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-brand-900"><CalendarDays className="h-5 w-5 text-accent-600" />{t('Upcoming Events')}</h2>
          <ul className="mt-4 divide-y rounded-2xl border bg-white">
            {events.slice(0, 5).map((e) => (
              <li key={e.id} className="flex gap-4 p-4">
                <div className="w-14 shrink-0 rounded-xl bg-brand-50 py-1.5 text-center"><p className="text-lg font-bold leading-none text-brand-700">{e.start_date.slice(8, 10)}</p><p className="mt-0.5 text-[10px] uppercase text-brand-600">{new Date(e.start_date).toLocaleString('en', { month: 'short' })}</p></div>
                <div><p className="font-medium">{pick(e.title, e.title_hi)}</p><p className="text-xs text-slate-500">{e.location ?? ''}{e.end_date && e.end_date !== e.start_date ? ` · till ${fmtDate(e.end_date)}` : ''}</p></div>
              </li>
            ))}
            {!events.length && <li className="p-6 text-center text-sm text-slate-500">{lang === 'hi' ? 'आगामी कार्यक्रमों की सूचना जल्द दी जाएगी।' : 'Upcoming events will be announced here.'}</li>}
          </ul>
        </div>
      </section>

      {/* Contact + enquiry */}
      <section id="enquiry" className="bg-slate-50 py-16">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold text-brand-900 sm:text-3xl">{t('Get in touch')}</h2>
            <Paragraphs text={pageText('contact')} className="mt-3 text-slate-600" />
            <div className="mt-6 space-y-4 text-slate-700">
              {s.address && <p className="flex gap-3"><MapPin className="h-5 w-5 shrink-0 text-brand-600" />{[s.address, s.city, s.state, s.pincode].filter(Boolean).join(', ')}</p>}
              {s.phone && <p className="flex gap-3"><Phone className="h-5 w-5 text-brand-600" /><a href={`tel:${s.phone}`} className="hover:text-brand-700">{s.phone}</a></p>}
              {s.email && <p className="flex gap-3"><Mail className="h-5 w-5 text-brand-600" /><a href={`mailto:${s.email}`} className="hover:text-brand-700">{s.email}</a></p>}
              {hours && <p className="flex gap-3"><Clock className="h-5 w-5 text-brand-600" />{hours}</p>}
              {s.mapUrl && <a className="btn-secondary mt-2" href={s.mapUrl} target="_blank" rel="noopener noreferrer"><MapPin className="h-4 w-4" />{t('Open map')}</a>}
            </div>
          </div>
          {s.enquiryEnabled && <div className="card p-6 shadow-md"><h3 className="mb-4 text-lg font-semibold">{t('Admission Enquiry')}</h3><EnquiryForm classes={classes} /></div>}
        </div>
      </section>
    </>
  );
}
