import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { usePublicSite } from '../../components/PublicLayout';
import { Loading } from '../../components/ui';
import { fmtDate } from '../../lib/format';
import { ICONS, Paragraphs } from './Home';

/** Generic content page backed by editable public_pages, enriched with live configured data. */
export default function InfoPage({ pageKey }: { pageKey: string }) {
  const { t, pick } = useI18n();
  const { data, isLoading } = usePublicSite();
  if (isLoading || !data) return <Loading />;
  const p = data.pages.find((x) => x.key === pageKey);
  const s = data.school;
  return (
    <div>
      <div className="bg-brand-800 py-12 text-white"><div className="mx-auto max-w-5xl px-4"><h1 className="text-3xl font-semibold">{p ? pick(p.title, p.title_hi) : t(pageKey)}</h1></div></div>
      <div className="mx-auto max-w-5xl px-4 py-10">
        {pageKey === 'about' && (s.about || s.aboutHi) && <Paragraphs text={pick(s.about, s.aboutHi)} className="mb-6 text-lg text-slate-700" />}
        <Paragraphs text={p ? pick(p.body, p.body_hi) : ''} className="text-slate-700" />
        {pageKey === 'about' && (s.mission || s.missionHi) && <div className="mt-8 rounded-xl bg-brand-50 p-6"><h2 className="font-semibold text-brand-800">{t('Our Mission')}</h2><Paragraphs text={pick(s.mission, s.missionHi)} className="mt-2" /></div>}
        {pageKey === 'academics' && (
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <div className="card p-5"><h2 className="font-semibold">{t('Classes')}</h2><ul className="mt-2 flex flex-wrap gap-2">{data.classes.map((c) => <li key={c.id} className="rounded-full bg-slate-100 px-3 py-1 text-sm">{pick(c.name, c.name_hi)}</li>)}</ul></div>
            <div className="card p-5"><h2 className="font-semibold">{t('Boards & Medium')}</h2><ul className="mt-2 space-y-1 text-sm">{data.boards.map((b) => <li key={b.code}><b>{b.code}</b> – {b.name}</li>)}</ul><p className="mt-2 text-sm">{data.mediums.map((m) => m.name).join(' · ')}</p></div>
          </div>
        )}
        {pageKey === 'preschool' && (
          <ul className="mt-8 flex flex-wrap gap-2">{data.classes.filter((c) => c.is_preschool).map((c) => <li key={c.id} className="rounded-full bg-accent-400/20 px-4 py-1.5 text-sm font-medium text-brand-900">{pick(c.name, c.name_hi)}</li>)}</ul>
        )}
        {pageKey === 'hostel' && data.hostels.length > 0 && (
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">{data.hostels.map((h) => <li key={h.name} className="card p-4"><p className="font-medium">{h.name}</p><p className="text-sm capitalize text-slate-500">{h.hostel_type.replace('_', '-')}</p></li>)}</ul>
        )}
        {pageKey === 'transport' && data.routes.length > 0 && (
          <ul className="mt-8 space-y-3">{data.routes.map((r) => <li key={r.name} className="card p-4"><p className="font-medium">{r.name}</p>{r.stops && <p className="text-sm text-slate-600">{r.stops}</p>}</li>)}</ul>
        )}
        {pageKey === 'facilities' && (
          <div className="mt-8 grid gap-4 sm:grid-cols-2">{data.facilities.map((f) => { const Icon = ICONS[f.icon] ?? Star; return (
            <div key={f.id} className="card flex gap-3 p-5"><Icon className="h-6 w-6 shrink-0 text-brand-600" /><div><h2 className="font-medium">{pick(f.title, f.title_hi)}</h2><p className="text-sm text-slate-600">{pick(f.description, f.description_hi)}</p></div></div>); })}</div>
        )}
        {pageKey === 'contact' && (
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="card space-y-2 p-5 text-sm">
              {s.address && <p>{[s.address, s.city, s.state, s.pincode].filter(Boolean).join(', ')}</p>}
              {s.phone && <p>{t('Phone')}: <a className="link" href={`tel:${s.phone}`}>{s.phone}</a></p>}
              {s.email && <p>{t('Email')}: <a className="link" href={`mailto:${s.email}`}>{s.email}</a></p>}
              {s.mapUrl && <a className="link" href={s.mapUrl} target="_blank" rel="noopener noreferrer">{t('Open map')} →</a>}
            </div>
            <div className="card p-5"><Link to="/admission" className="btn-primary">{t('Admission Enquiry')}</Link></div>
          </div>
        )}
        {(pageKey === 'about' || pageKey === 'admissions') && <Link to="/admission" className="btn-primary mt-8">{t('Apply for Admission')}</Link>}
      </div>
    </div>
  );
}

export function GalleryPage() {
  const { t, pick } = useI18n();
  const { data, isLoading } = usePublicSite();
  if (isLoading || !data) return <Loading />;
  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      <h1 className="text-3xl font-semibold text-brand-900">{t('Gallery')}</h1>
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {data.gallery.map((g) => (
          <figure key={g.id} className="overflow-hidden rounded-xl bg-slate-100">
            <img src={`/api/files/${g.file_id}`} alt={pick(g.title, g.title_hi)} loading="lazy" className="aspect-[4/3] w-full object-cover" />
            <figcaption className="px-3 py-2 text-sm text-slate-600">{pick(g.title, g.title_hi)}</figcaption>
          </figure>
        ))}
      </div>
      {!data.gallery.length && <p className="mt-6 text-slate-500">—</p>}
    </div>
  );
}

export function NoticesPage() {
  const { t, pick } = useI18n();
  const { data, isLoading } = usePublicSite();
  if (isLoading || !data) return <Loading />;
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-semibold text-brand-900">{t('Notices')}</h1>
      <div className="mt-8 space-y-4">
        {data.notices.map((n) => (
          <article key={n.id} className="card p-5">
            <h2 className="font-semibold">{pick(n.title, n.title_hi)}</h2>
            <p className="text-xs text-slate-500">{fmtDate(n.publish_at)}</p>
            <Paragraphs text={pick(n.body, n.body_hi)} className="mt-3 text-sm text-slate-700" />
            {n.attachment_file_id && <a className="link mt-2 inline-block text-sm" href={`/api/files/${n.attachment_file_id}`} target="_blank" rel="noreferrer">Attachment</a>}
          </article>
        ))}
        {!data.notices.length && <p className="text-slate-500">—</p>}
      </div>
      <h2 className="mt-12 text-xl font-semibold text-brand-900">{t('Upcoming Events')}</h2>
      <ul className="mt-4 divide-y rounded-xl border bg-white">
        {data.events.map((e) => <li key={e.id} className="p-4"><p className="font-medium">{pick(e.title, e.title_hi)}</p><p className="text-sm text-slate-500">{fmtDate(e.start_date)}{e.end_date && e.end_date !== e.start_date ? ` – ${fmtDate(e.end_date)}` : ''} {e.location ? `· ${e.location}` : ''}</p>{e.description && <p className="mt-1 text-sm">{e.description}</p>}</li>)}
        {!data.events.length && <li className="p-4 text-slate-500">—</li>}
      </ul>
    </div>
  );
}
