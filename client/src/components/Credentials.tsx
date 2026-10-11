import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Field, Modal, useAction } from './ui';
import { api } from '../lib/api';

export interface Creds { username: string; password?: string; temporaryPassword?: string; mustChange?: boolean; name?: string; [k: string]: any }

/** Shows login details right after an account is created or its password is set. */
export function CredentialsModal({ creds, onClose }: { creds: Creds | null; onClose: () => void }) {
  const pw = creds?.password ?? creds?.temporaryPassword;
  const mustChange = creds?.mustChange ?? !creds?.password;
  return (
    <Modal open={!!creds} onClose={onClose} title="Login details" size="sm" footer={<>
      <button className="btn-secondary" onClick={() => window.print()}>Print</button>
      <button className="btn-primary" onClick={onClose}>Done</button>
    </>}>
      {creds && (
        <div className="print-area space-y-3 text-sm">
          <div className="rounded-lg border bg-slate-50 p-4">
            {creds.name && <p className="mb-2 text-base font-semibold">{creds.name}</p>}
            <p>Login ID: <b className="font-mono">{creds.username}</b></p>
            <p>Password: <b className="font-mono">{pw}</b></p>
            <p className="mt-2 text-xs text-slate-500">Sign in at: {location.origin}/login</p>
          </div>
          {mustChange
            ? <p className="text-amber-700">This is a temporary password. The user will be asked to choose a new one at first sign-in.</p>
            : <p className="text-slate-600">Share these details privately. The password can be changed any time from the profile.</p>}
        </div>
      )}
    </Modal>
  );
}

/** Optional password input used when creating an account. Empty = generate a temporary password. */
export function PasswordField({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string[] }) {
  const [show, setShow] = useState(false);
  return (
    <Field label="Login password" hint="Set any password (min 6 characters), or leave empty to generate a temporary one. Login ID = the generated ID." error={error}>
      <div className="relative">
        <input className="input pr-10" type={show ? 'text' : 'password'} autoComplete="new-password" value={value} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="absolute right-2 top-2 text-slate-400" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
      </div>
    </Field>
  );
}

/** Principal sets a specific password for an existing account. */
export function SetPasswordModal({ url, name, onClose, onDone }: { url: string; name: string; onClose: () => void; onDone: (c: Creds) => void }) {
  const [pw, setPw] = useState('');
  const [mustChange, setMustChange] = useState(false);
  const { run, busy, fieldErrors } = useAction();
  return (
    <Modal open onClose={onClose} title={`Set password – ${name}`} size="sm" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button>
      <button className="btn-primary" disabled={busy || pw.length < 6} onClick={async () => { const r = await run(() => api.post(url, { password: pw, mustChange }), { success: 'Password updated.' }); if (r) onDone({ ...r, name }); }}>Save password</button></>}>
      <PasswordField value={pw} onChange={setPw} error={fieldErrors.password} />
      <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={mustChange} onChange={(e) => setMustChange(e.target.checked)} />Ask the user to change it at next sign-in</label>
      <p className="mt-2 text-xs text-slate-500">The user is signed out of other devices.</p>
    </Modal>
  );
}
