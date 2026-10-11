import { useApi } from './ui';
import { useI18n } from '../lib/i18n';

/** School letterhead for printable documents (admission card, fee card…). */
export function PrintHeader({ title, titleHi }: { title: string; titleHi: string }) {
  const { lang } = useI18n();
  const s = useApi<any>('/api/settings/school').data;
  if (!s) return null;
  const addr = [s.address, s.city, s.state, s.pincode].filter(Boolean).join(', ');
  return (
    <header className="border-b-2 border-brand-700 pb-3">
      <div className="flex items-center gap-4">
        {s.logo_file_id ? <img src={`/api/files/${s.logo_file_id}`} alt="" className="h-16 w-16 object-contain" />
          : <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-brand-700 text-xl font-bold text-white">{s.name.split(/\s+/).map((w: string) => w[0]).slice(0, 2).join('')}</div>}
        <div className="min-w-0 flex-1 text-center">
          <h2 className="text-xl font-bold uppercase tracking-wide text-brand-800">{lang === 'hi' && s.name_hi ? s.name_hi : s.name}</h2>
          {addr && <p className="text-xs text-slate-600">{addr}</p>}
          <p className="text-xs text-slate-600">{[s.phone, s.email].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="w-16" />
      </div>
      <p className="mt-3 text-center text-base font-bold tracking-widest text-brand-700">{lang === 'hi' ? titleHi : title}</p>
    </header>
  );
}

export function Signatures({ labels }: { labels: string[] }) {
  return (
    <div className="mt-14 grid gap-6 text-center text-xs text-slate-600" style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }}>
      {labels.map((l) => <div key={l} className="border-t border-slate-400 pt-1">{l}</div>)}
    </div>
  );
}
