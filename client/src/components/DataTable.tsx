import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { EmptyState } from './ui';
import { useI18n } from '../lib/i18n';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render?: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number | null | undefined;
  className?: string;
  sortable?: boolean;
}

/** Client-side searchable, sortable, paginated table. Suitable for the data volumes of a 50–500 student school. */
export function DataTable<T extends Record<string, any>>({ columns, rows, search, pageSize = 25, toolbar, rowKey, empty, onRowClick }: {
  columns: Column<T>[]; rows: T[]; search?: (row: T) => string; pageSize?: number; toolbar?: ReactNode; rowKey?: (row: T) => string | number; empty?: ReactNode; onRowClick?: (row: T) => void;
}) {
  const { t } = useI18n();
  const [term, setTerm] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => {
    let r = rows;
    if (term && search) { const s = term.toLowerCase(); r = r.filter((x) => search(x).toLowerCase().includes(s)); }
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      const val = col?.sortValue ?? ((x: T) => x[sort.key]);
      r = [...r].sort((a, b) => {
        const va = val(a), vb = val(b);
        if (va == null) return 1; if (vb == null) return -1;
        return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), undefined, { numeric: true })) * sort.dir;
      });
    }
    return r;
  }, [rows, term, sort, search, columns]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const p = Math.min(page, pages - 1);
  const shown = filtered.slice(p * pageSize, (p + 1) * pageSize);
  return (
    <div>
      {(search || toolbar) && (
        <div className="no-print flex flex-col gap-2 border-b border-slate-100 p-3 sm:flex-row sm:items-center sm:justify-between">
          {search ? (
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input className="input pl-9" placeholder={t('Search')} value={term} onChange={(e) => { setTerm(e.target.value); setPage(0); }} aria-label={t('Search')} />
            </div>
          ) : <span />}
          {toolbar && <div className="flex flex-wrap gap-2">{toolbar}</div>}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50">
            <tr>
              {columns.map((c) => {
                const sortable = c.sortable !== false && (c.sortValue || !c.render);
                const active = sort?.key === c.key;
                return (
                  <th key={c.key} className={`th ${c.className ?? ''}`} aria-sort={active ? (sort!.dir === 1 ? 'ascending' : 'descending') : undefined}>
                    {sortable ? (
                      <button className="inline-flex items-center gap-1 uppercase" onClick={() => setSort(active ? { key: c.key, dir: sort!.dir === 1 ? -1 : 1 } : { key: c.key, dir: 1 })}>
                        {c.header}{active && (sort!.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                      </button>
                    ) : c.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {shown.map((r, i) => (
              <tr key={rowKey ? rowKey(r) : r.id ?? i} className={onRowClick ? 'cursor-pointer hover:bg-slate-50' : 'hover:bg-slate-50/60'} onClick={onRowClick ? () => onRowClick(r) : undefined}>
                {columns.map((c) => <td key={c.key} className={`td ${c.className ?? ''}`}>{c.render ? c.render(r) : (r[c.key] ?? '—')}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && (empty ?? <EmptyState />)}
      </div>
      {filtered.length > pageSize && (
        <div className="no-print flex items-center justify-between border-t border-slate-100 px-3 py-2 text-sm text-slate-500">
          <span>{p * pageSize + 1}–{Math.min((p + 1) * pageSize, filtered.length)} / {filtered.length}</span>
          <div className="flex gap-1">
            <button className="btn-ghost btn-sm" disabled={p === 0} onClick={() => setPage(p - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
            <button className="btn-ghost btn-sm" disabled={p >= pages - 1} onClick={() => setPage(p + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
