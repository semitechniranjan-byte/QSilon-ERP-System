import { Async, Card, PageHeader, useApi } from '../../components/ui';
import { useI18n } from '../../lib/i18n';
import { fmtDate } from '../../lib/format';

export default function StudentMaterials() {
  const { t } = useI18n();
  const q = useApi<any[]>('/api/me/materials');
  return (
    <>
      <PageHeader title={t('Study Materials')} />
      <Card bodyClass="p-0"><Async q={q}>{(rows) => (
        <ul className="divide-y">{rows.map((m) => <li key={m.id} className="p-4"><p className="font-medium">{m.title} <span className="text-xs text-slate-500">· {m.subject_name} · {fmtDate(m.created_at)}</span></p>{m.description && <p className="text-sm text-slate-600">{m.description}</p>}
          <div className="mt-1 flex gap-3 text-sm">{m.file_id && <a className="link" href={`/api/files/${m.file_id}?download=1`}>{m.original_name ?? 'Download'}</a>}{m.link_url && <a className="link" href={m.link_url} target="_blank" rel="noopener noreferrer">Open link</a>}</div></li>)}
          {!rows.length && <li className="p-4 text-sm text-slate-500">No materials yet.</li>}</ul>
      )}</Async></Card>
    </>
  );
}
