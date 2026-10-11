import { useState } from 'react';
import { useApi } from './ui';
import { qs } from '../lib/api';
import { fullName } from '../lib/format';

/** Search-as-you-type student selector (current-year enrollment info included). */
export function StudentPicker({ onPick, placeholder = 'Search student by name or ID' }: { onPick: (s: any) => void; placeholder?: string }) {
  const [term, setTerm] = useState('');
  const r = useApi<any[]>(term.trim().length >= 2 ? `/api/students${qs({ search: term.trim() })}` : null);
  return (
    <div className="relative">
      <input className="input" placeholder={placeholder} value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Student search" />
      {r.data && term && (
        <ul className="absolute z-10 mt-1 max-h-60 w-full divide-y overflow-y-auto rounded-lg border bg-white shadow-lg">
          {r.data.slice(0, 15).map((s) => <li key={s.id}><button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => { onPick(s); setTerm(''); }}>
            <b>{fullName(s)}</b> <span className="text-slate-500">{s.student_code} · {s.class_name} {s.section_name}</span></button></li>)}
          {!r.data.length && <li className="px-3 py-2 text-sm text-slate-500">No match</li>}
        </ul>
      )}
    </div>
  );
}
