import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Card, Field, Modal, PageHeader, useAction } from '../../components/ui';
import { DataTable } from '../../components/DataTable';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { useLookups } from '../../lib/lookups';

export default function Subjects() {
  const { t } = useI18n();
  const { lk } = useLookups();
  const [edit, setEdit] = useState<any>(null);
  const { run, busy, fieldErrors } = useAction();
  return (
    <>
      <PageHeader title={t('Subjects')} actions={<button className="btn-primary" onClick={() => setEdit({ name: '', nameHi: '', code: '', isActive: true })}><Plus className="h-4 w-4" />{t('Add')}</button>} />
      <Card bodyClass="p-0">
        {lk && <DataTable rows={lk.subjects} search={(r) => `${r.name} ${r.code}`} columns={[
          { key: 'code', header: 'Code' }, { key: 'name', header: t('Name') }, { key: 'name_hi', header: 'Hindi name' }, { key: 'a', header: 'Active', render: (r) => (r.is_active ? 'Yes' : 'No') },
          { key: 'e', header: '', sortable: false, render: (r) => <button className="link" onClick={() => setEdit({ id: r.id, name: r.name, nameHi: r.name_hi ?? '', code: r.code, isActive: r.is_active })}>{t('Edit')}</button> }]} />}
      </Card>
      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit.id ? t('Edit') : t('Add')} footer={<><button className="btn-secondary" onClick={() => setEdit(null)}>{t('Cancel')}</button>
          <button className="btn-primary" disabled={busy} onClick={async () => { if (await run(() => (edit.id ? api.put(`/api/settings/subjects/${edit.id}`, edit) : api.post('/api/settings/subjects', edit)))) setEdit(null); }}>{t('Save')}</button></>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('Name')} error={fieldErrors.name}><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Hindi name"><input className="input" value={edit.nameHi} onChange={(e) => setEdit({ ...edit, nameHi: e.target.value })} /></Field>
            <Field label="Code" hint="Uppercase, e.g. MATH" error={fieldErrors.code}><input className="input" value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase() })} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.isActive} onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })} />Active</label>
          </div>
        </Modal>
      )}
    </>
  );
}
