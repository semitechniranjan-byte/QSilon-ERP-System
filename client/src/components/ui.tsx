import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Inbox, Loader2, X } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useI18n } from '../lib/i18n';

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} aria-hidden />;
}
export function Loading({ label }: { label?: string }) {
  const { t } = useI18n();
  return <div className="flex items-center justify-center gap-2 py-12 text-slate-500" role="status"><Spinner /> {label ?? t('Loading…')}</div>;
}
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useI18n();
  const msg = error instanceof Error ? error.message : t('Something went wrong.');
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-8 text-center text-red-700" role="alert">
      <AlertCircle className="h-6 w-6" />
      <p className="text-sm">{msg}</p>
      {onRetry && <button className="btn-secondary btn-sm" onClick={onRetry}>Try again</button>}
    </div>
  );
}
export function EmptyState({ title, children, icon }: { title?: string; children?: ReactNode; icon?: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-slate-500">
      {icon ?? <Inbox className="h-8 w-8 text-slate-300" />}
      <p className="font-medium text-slate-600">{title ?? t('No records found.')}</p>
      {children && <div className="text-sm">{children}</div>}
    </div>
  );
}

/** Fetch a GET endpoint with react-query. Pass null to disable. */
export function useApi<T = any>(url: string | null, opts: { refetchInterval?: number } = {}) {
  return useQuery<T>({ queryKey: [url], queryFn: () => api.get<T>(url!), enabled: !!url, ...opts });
}
export function Async<T>({ q, children, empty }: { q: { isLoading: boolean; error: unknown; data: T | undefined; refetch: () => unknown }; children: (d: T) => ReactNode; empty?: (d: T) => boolean }) {
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.data === undefined) return null;
  if (empty?.(q.data)) return <EmptyState />;
  return <>{children(q.data)}</>;
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: string }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back && <Link to={back} className="mb-1 inline-block text-sm text-slate-500 hover:text-slate-700">← Back</Link>}
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
export function Card({ title, actions, children, className = '', bodyClass = 'p-4 sm:p-5' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
          {title && <h2 className="font-semibold text-slate-800">{title}</h2>}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}
const TONES: Record<string, string> = {
  gray: 'bg-slate-100 text-slate-700', green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', red: 'bg-red-50 text-red-700 ring-red-600/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/20', blue: 'bg-brand-50 text-brand-700 ring-brand-600/20', purple: 'bg-violet-50 text-violet-700 ring-violet-600/20',
};
export function Badge({ tone = 'gray', children }: { tone?: keyof typeof TONES | string; children: ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-transparent ${TONES[tone] ?? TONES.gray}`}>{children}</span>;
}
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'green', present: 'green', paid: 'green', completed: 'green', approved: 'green', published: 'green', graded: 'green', valid: 'green', cleared: 'green',
    absent: 'red', reversed: 'red', cancelled: 'red', withdrawn: 'red', inactive: 'red', rejected: 'red', fail: 'red',
    late: 'amber', half_day: 'amber', pending: 'amber', submitted: 'blue', pending_review: 'amber', returned: 'amber', draft: 'gray', marks_entry: 'blue', new: 'blue',
    leave: 'purple', hostel: 'purple', promoted: 'blue', transferred: 'gray', alumni: 'gray', closed: 'gray', in_progress: 'blue', pass: 'green',
  };
  return <Badge tone={map[status] ?? 'gray'}>{status.replace(/_/g, ' ')}</Badge>;
}

export function StatCard({ label, value, icon, hint, to, tone = 'brand' }: { label: string; value: ReactNode; icon?: ReactNode; hint?: ReactNode; to?: string; tone?: 'brand' | 'green' | 'amber' | 'red' | 'purple' }) {
  const toneCls = { brand: 'bg-brand-50 text-brand-600', green: 'bg-emerald-50 text-emerald-600', amber: 'bg-amber-50 text-amber-600', red: 'bg-red-50 text-red-600', purple: 'bg-violet-50 text-violet-600' }[tone];
  const body = (
    <div className="card flex items-start gap-3 p-4 transition hover:shadow-md">
      {icon && <div className={`rounded-lg p-2 ${toneCls}`}>{icon}</div>}
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-0.5 text-2xl font-semibold text-slate-900">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </div>
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export function Field({ label, error, hint, children, required, className = '' }: { label: ReactNode; error?: string | string[]; hint?: ReactNode; children: ReactNode; required?: boolean; className?: string }) {
  const err = Array.isArray(error) ? error[0] : error;
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}{required && <span className="text-red-500"> *</span>}</span>
      {children}
      {hint && !err && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
      {err && <span className="mt-1 block text-xs text-red-600">{err}</span>}
    </label>
  );
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    setTimeout(() => ref.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus(), 10);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  const w = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" className={`flex max-h-[92vh] w-full ${w} flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl`}>
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <button className="btn-ghost p-1" onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t bg-slate-50 px-5 py-3 sm:rounded-b-2xl">{footer}</div>}
      </div>
    </div>
  );
}

// ---------- Toasts & confirmations ----------
interface Toast { id: number; kind: 'success' | 'error'; text: string }
interface ConfirmReq { title: string; message: ReactNode; confirmLabel?: string; danger?: boolean; reason?: boolean; resolve: (v: false | { reason: string }) => void }
const UiCtx = createContext<{ toast: (kind: Toast['kind'], text: string) => void; confirm: (o: Omit<ConfirmReq, 'resolve'>) => Promise<false | { reason: string }> }>(null as any);

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [req, setReq] = useState<ConfirmReq | null>(null);
  const [reason, setReason] = useState('');
  const toast = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 3500);
  }, []);
  const confirm = useCallback((o: Omit<ConfirmReq, 'resolve'>) => new Promise<false | { reason: string }>((resolve) => { setReason(''); setReq({ ...o, resolve }); }), []);
  const close = (v: false | { reason: string }) => { req?.resolve(v); setReq(null); };
  return (
    <UiCtx.Provider value={{ toast, confirm }}>
      {children}
      <div className="no-print pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`pointer-events-auto flex items-start gap-2 rounded-lg px-4 py-3 text-sm shadow-lg ${t.kind === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
            {t.kind === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
      <Modal open={!!req} onClose={() => close(false)} title={req?.title} size="sm"
        footer={<>
          <button className="btn-secondary" onClick={() => close(false)}>Cancel</button>
          <button className={req?.danger ? 'btn-danger' : 'btn-primary'} disabled={req?.reason && reason.trim().length < 3} onClick={() => close({ reason })}>{req?.confirmLabel ?? 'Confirm'}</button>
        </>}>
        <div className="space-y-3 text-sm text-slate-600">
          <div>{req?.message}</div>
          {req?.reason && <Field label="Reason (recorded in the audit log)" required><textarea className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>}
        </div>
      </Modal>
    </UiCtx.Provider>
  );
}
export const useUi = () => useContext(UiCtx);

/** Run a mutation with toasts, field errors and cache invalidation. */
export function useAction() {
  const { toast } = useUi();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const run = async <T,>(fn: () => Promise<T>, opts: { success?: string | false; invalidate?: boolean } = {}): Promise<T | undefined> => {
    setBusy(true);
    setFieldErrors({});
    try {
      const r = await fn();
      if (opts.success !== false) toast('success', opts.success ?? 'Saved successfully.');
      if (opts.invalidate !== false) await qc.invalidateQueries();
      return r;
    } catch (e) {
      if (e instanceof ApiError && e.fields) setFieldErrors(e.fields);
      toast('error', e instanceof Error ? e.message : 'Something went wrong.');
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { run, busy, fieldErrors, setFieldErrors };
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { key: T; label: ReactNode }[]; value: T; onChange: (k: T) => void }) {
  return (
    <div className="no-print mb-4 flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={value === t.key} onClick={() => onChange(t.key)}
          className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${value === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function FileInput({ purpose, accept, onUploaded, label = 'Upload file' }: { purpose: string; accept?: string; onUploaded: (f: { id: string; name: string }) => void; label?: string }) {
  const { toast } = useUi();
  const [busy, setBusy] = useState(false);
  return (
    <label className="btn-secondary btn-sm cursor-pointer">
      {busy ? <Spinner /> : null}{label}
      <input type="file" className="sr-only" accept={accept} disabled={busy} onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        if (f.size > 5 * 1024 * 1024) return toast('error', 'File is larger than 5 MB.');
        setBusy(true);
        try { onUploaded(await api.upload(f, purpose)); } catch (err) { toast('error', (err as Error).message); } finally { setBusy(false); }
      }} />
    </label>
  );
}
