import { useState } from 'react';
import { BedDouble, Download, Plus } from 'lucide-react';
import { Async, Badge, Card, DeleteButton, Field, Modal, PageHeader, Tabs, useAction, useApi, useUi } from '../../components/ui';
import { DataTable } from '../../components/DataTable';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { fmtDate, fullName, todayISO } from '../../lib/format';

export default function Hostel() {
  const { t } = useI18n();
  const [tab, setTab] = useState<'rooms' | 'residents' | 'vacant'>('rooms');
  return (
    <>
      <PageHeader title={t('Hostel')} actions={<a className="btn-secondary" href="/api/reports/hostel-occupancy?format=xlsx"><Download className="h-4 w-4" />Occupancy report</a>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'rooms', label: 'Hostels & rooms' }, { key: 'residents', label: t('Hostel residents') }, { key: 'vacant', label: 'Vacant beds' }]} />
      {tab === 'rooms' && <Rooms />}{tab === 'residents' && <Residents />}{tab === 'vacant' && <Vacant />}
    </>
  );
}

function AllocateModal({ bed, student, onClose }: { bed?: any; student?: any; onClose: () => void }) {
  const residents = useApi<any[]>('/api/hostel/residents');
  const vacant = useApi<any[]>('/api/hostel/reports/vacant');
  const [studentId, setStudentId] = useState(student?.student_id ? String(student.student_id) : '');
  const [bedId, setBedId] = useState(bed?.id ? String(bed.id) : '');
  const [checkIn, setCheckIn] = useState(todayISO());
  const { run, busy } = useAction();
  const transfer = student?.allocation_id;
  return (
    <Modal open onClose={onClose} title={transfer ? 'Transfer to another bed' : 'Allocate bed'} footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button>
      <button className="btn-primary" disabled={busy || !studentId || !bedId} onClick={async () => {
        const ok = await run(() => transfer ? api.post(`/api/hostel/allocations/${student.allocation_id}/transfer`, { bedId: Number(bedId), date: checkIn }) : api.post('/api/hostel/allocations', { studentId: Number(studentId), bedId: Number(bedId), checkIn }));
        if (ok) onClose();
      }}>{transfer ? 'Transfer' : 'Allocate'}</button></>}>
      <div className="grid gap-3">
        <Field label="Student" hint="Only students marked as hostel residents are listed.">
          <select className="input" value={studentId} disabled={!!student} onChange={(e) => setStudentId(e.target.value)}><option value="">—</option>
            {residents.data?.filter((r) => !r.allocation_id || String(r.student_id) === studentId).map((r) => <option key={r.student_id} value={r.student_id}>{fullName(r)} – {r.class_name} {r.section_name}</option>)}</select>
        </Field>
        <Field label="Bed"><select className="input" value={bedId} disabled={!!bed} onChange={(e) => setBedId(e.target.value)}><option value="">—</option>
          {bed && <option value={bed.id}>{bed.label}</option>}
          {vacant.data?.map((v) => <option key={v.bed_id} value={v.bed_id}>{v.hostel} · Room {v.room_no} · {v.bed_no}</option>)}</select></Field>
        <Field label={transfer ? 'Transfer date' : 'Check-in date'}><input type="date" className="input" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function Rooms() {
  const hostels = useApi<any[]>('/api/hostel');
  const [hid, setHid] = useState<number | null>(null);
  const h = hid ?? hostels.data?.[0]?.id ?? null;
  const rooms = useApi<any[]>(h ? `/api/hostel/${h}/rooms` : null);
  const [editH, setEditH] = useState<any>(null);
  const [editR, setEditR] = useState<any>(null);
  const [alloc, setAlloc] = useState<any>(null);
  const { confirm } = useUi();
  const { run, busy, fieldErrors } = useAction();
  const cur = hostels.data?.find((x) => x.id === h);
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        {hostels.data?.map((x) => <button key={x.id} className={x.id === h ? 'btn-primary' : 'btn-secondary'} onClick={() => setHid(x.id)}>{x.name} <span className="text-xs opacity-75">{x.occupied}/{x.capacity}</span></button>)}
        <button className="btn-ghost" onClick={() => setEditH({ name: '', hostelType: 'boys', building: '', wardenName: '', wardenPhone: '', emergencyPhone: '', notes: '' })}><Plus className="h-4 w-4" />Hostel</button>
      </div>
      {cur && (
        <Card title={<span>{cur.name} <Badge tone="purple">{cur.hostel_type.replace('_', '-')}</Badge></span>} actions={<>
          <DeleteButton className="btn-ghost btn-sm text-red-600" url={`/api/hostel/${cur.id}`} what={`Hostel "${cur.name}"`} onDone={() => setHid(null)} />
          <button className="btn-secondary btn-sm" onClick={() => setEditH({ id: cur.id, name: cur.name, hostelType: cur.hostel_type, building: cur.building ?? '', wardenName: cur.warden_name ?? '', wardenPhone: cur.warden_phone ?? '', emergencyPhone: cur.emergency_phone ?? '', notes: cur.notes ?? '', isActive: cur.is_active })}>Edit hostel</button>
          <button className="btn-primary btn-sm" onClick={() => setEditR({ hostelId: cur.id, roomNo: '', floor: '', roomType: '', capacity: 2 })}><Plus className="h-4 w-4" />Room</button></>}>
          <p className="mb-4 text-sm text-slate-500">Warden: {cur.warden_name ?? '—'} {cur.warden_phone ? `· ${cur.warden_phone}` : ''} · Emergency: {cur.emergency_phone ?? '—'}</p>
          <Async q={rooms}>{(rs) => (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{rs.map((r) => {
              const occ = r.beds.filter((b: any) => b.allocation_id).length;
              return (
                <div key={r.id} className={`rounded-xl border p-3 ${!r.is_active ? 'opacity-50' : ''}`}>
                  <div className="mb-2 flex items-center justify-between"><p className="font-semibold">Room {r.room_no} <span className="text-xs font-normal text-slate-500">{r.floor ? `Floor ${r.floor}` : ''} {r.room_type ?? ''}</span></p>
                    <span className="flex gap-2"><button className="link text-xs" onClick={() => setEditR({ id: r.id, roomNo: r.room_no, floor: r.floor ?? '', roomType: r.room_type ?? '', capacity: r.capacity, isActive: r.is_active })}>Edit</button><DeleteButton className="link text-xs text-red-600" url={`/api/hostel/rooms/${r.id}`} what={`Room ${r.room_no}`} /></span></div>
                  <p className="mb-2 text-xs text-slate-500">{occ} / {r.capacity} occupied</p>
                  <ul className="space-y-1">{r.beds.filter((b: any) => b.is_active || b.allocation_id).map((b: any) => (
                    <li key={b.id} className={`flex items-center justify-between rounded-md px-2 py-1 text-sm ${b.allocation_id ? 'bg-violet-50' : 'bg-emerald-50'}`}>
                      <span className="flex items-center gap-1.5"><BedDouble className="h-3.5 w-3.5" />{b.bed_no}: {b.allocation_id ? `${fullName(b)}` : <span className="text-emerald-700">vacant</span>}</span>
                      {b.allocation_id ? <button className="link text-xs" onClick={async () => { const c = await confirm({ title: 'Check out', message: `Check out ${fullName(b)} today?` }); if (c) run(() => api.post(`/api/hostel/allocations/${b.allocation_id}/checkout`, { date: todayISO() })); }}>Check out</button>
                        : <button className="link text-xs" onClick={() => setAlloc({ bed: { id: b.id, label: `Room ${r.room_no} · ${b.bed_no}` } })}>Allocate</button>}
                    </li>))}</ul>
                </div>);
            })}{!rs.length && <p className="text-sm text-slate-500">No rooms yet.</p>}</div>
          )}</Async>
        </Card>
      )}
      {!hostels.data?.length && !hostels.isLoading && <Card><p className="text-sm text-slate-500">No hostels configured.</p></Card>}
      {editH && (
        <Modal open onClose={() => setEditH(null)} title={editH.id ? 'Edit hostel' : 'New hostel'} footer={<><button className="btn-secondary" onClick={() => setEditH(null)}>Cancel</button>
          <button className="btn-primary" disabled={busy} onClick={async () => { if (await run(() => (editH.id ? api.put(`/api/hostel/${editH.id}`, editH) : api.post('/api/hostel', editH)))) setEditH(null); }}>Save</button></>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" error={fieldErrors.name}><input className="input" value={editH.name} onChange={(e) => setEditH({ ...editH, name: e.target.value })} /></Field>
            <Field label="Type"><select className="input" value={editH.hostelType} onChange={(e) => setEditH({ ...editH, hostelType: e.target.value })}><option value="boys">Boys</option><option value="girls">Girls</option><option value="co_ed">Co-ed</option></select></Field>
            <Field label="Building"><input className="input" value={editH.building} onChange={(e) => setEditH({ ...editH, building: e.target.value })} /></Field>
            <Field label="Warden name"><input className="input" value={editH.wardenName} onChange={(e) => setEditH({ ...editH, wardenName: e.target.value })} /></Field>
            <Field label="Warden phone"><input className="input" value={editH.wardenPhone} onChange={(e) => setEditH({ ...editH, wardenPhone: e.target.value })} /></Field>
            <Field label="Emergency phone"><input className="input" value={editH.emergencyPhone} onChange={(e) => setEditH({ ...editH, emergencyPhone: e.target.value })} /></Field>
            <Field label="Notes" className="sm:col-span-2"><textarea className="input" rows={2} value={editH.notes} onChange={(e) => setEditH({ ...editH, notes: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
      {editR && (
        <Modal open onClose={() => setEditR(null)} title={editR.id ? 'Edit room' : 'New room'} footer={<><button className="btn-secondary" onClick={() => setEditR(null)}>Cancel</button>
          <button className="btn-primary" disabled={busy} onClick={async () => { if (await run(() => (editR.id ? api.put(`/api/hostel/rooms/${editR.id}`, editR) : api.post(`/api/hostel/${editR.hostelId}/rooms`, editR)))) setEditR(null); }}>Save</button></>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Room no." error={fieldErrors.roomNo}><input className="input" value={editR.roomNo} onChange={(e) => setEditR({ ...editR, roomNo: e.target.value })} /></Field>
            <Field label="Capacity (beds)" hint="Beds are created automatically; capacity can't go below current occupancy."><input className="input" type="number" min={1} max={50} value={editR.capacity} onChange={(e) => setEditR({ ...editR, capacity: Number(e.target.value) })} /></Field>
            <Field label="Floor"><input className="input" value={editR.floor} onChange={(e) => setEditR({ ...editR, floor: e.target.value })} /></Field>
            <Field label="Room type"><input className="input" value={editR.roomType} onChange={(e) => setEditR({ ...editR, roomType: e.target.value })} placeholder="AC / Non-AC / Dormitory" /></Field>
          </div>
        </Modal>
      )}
      {alloc && <AllocateModal bed={alloc.bed} onClose={() => setAlloc(null)} />}
    </>
  );
}

function Residents() {
  const { t } = useI18n();
  const q = useApi<any[]>('/api/hostel/residents');
  const [alloc, setAlloc] = useState<any>(null);
  const { confirm } = useUi();
  const { run } = useAction();
  return (
    <Card bodyClass="p-0">
      <Async q={q}>{(rows) => (
        <DataTable rows={rows} rowKey={(r) => r.student_id} search={(r) => `${fullName(r)} ${r.student_code} ${r.room_no ?? ''}`} columns={[
          { key: 'name', header: t('Name'), render: (r) => <span className="font-medium">{fullName(r)}</span>, sortValue: fullName },
          { key: 'class', header: t('Class'), render: (r) => `${r.class_name} ${r.section_name}` },
          { key: 'bed', header: 'Bed', render: (r) => (r.allocation_id ? `${r.hostel_name} · ${r.room_no} · ${r.bed_no}` : <Badge tone="amber">not allocated</Badge>), sortValue: (r) => `${r.hostel_name ?? ''}${r.room_no ?? ''}` },
          { key: 'check_in', header: 'Since', render: (r) => fmtDate(r.check_in) },
          { key: 'guardian', header: t('Guardian') },
          { key: 'em', header: 'Emergency', render: (r) => [r.emergency_contact_name, r.emergency_contact_phone].filter(Boolean).join(' · ') || '—' },
          { key: 'a', header: '', sortable: false, render: (r) => r.allocation_id ? <span className="whitespace-nowrap"><button className="link mr-3" onClick={() => setAlloc(r)}>Transfer</button>
            <button className="link" onClick={async () => { if (await confirm({ title: 'Check out', message: `Check out ${fullName(r)} today?` })) run(() => api.post(`/api/hostel/allocations/${r.allocation_id}/checkout`, { date: todayISO() })); }}>Check out</button></span>
            : <button className="btn-primary btn-sm" onClick={() => setAlloc({ ...r })}>Allocate</button> },
        ]} />
      )}</Async>
      {alloc && <AllocateModal student={alloc} onClose={() => setAlloc(null)} />}
    </Card>
  );
}

function Vacant() {
  const q = useApi<any[]>('/api/hostel/reports/vacant');
  return <Card bodyClass="p-0"><Async q={q}>{(rows) => <DataTable rows={rows} rowKey={(r) => r.bed_id} columns={[{ key: 'hostel', header: 'Hostel' }, { key: 'hostel_type', header: 'Type' }, { key: 'room_no', header: 'Room' }, { key: 'floor', header: 'Floor' }, { key: 'bed_no', header: 'Bed' }]} />}</Async></Card>;
}
