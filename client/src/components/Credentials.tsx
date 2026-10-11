import { Modal } from './ui';

/** Shows a newly issued temporary password exactly once. */
export function CredentialsModal({ creds, onClose }: { creds: { username: string; temporaryPassword: string; name?: string } | null; onClose: () => void }) {
  return (
    <Modal open={!!creds} onClose={onClose} title="Login details" size="sm" footer={<>
      <button className="btn-secondary" onClick={() => window.print()}>Print</button>
      <button className="btn-primary" onClick={onClose}>Done</button>
    </>}>
      {creds && (
        <div className="print-area space-y-3 text-sm">
          {creds.name && <p className="font-medium">{creds.name}</p>}
          <div className="rounded-lg bg-slate-50 p-4 font-mono">
            <p>User ID: <b>{creds.username}</b></p>
            <p>Temporary password: <b>{creds.temporaryPassword}</b></p>
          </div>
          <p className="text-amber-700">This password is shown only once. Share it privately. The user must change it at first sign-in.</p>
        </div>
      )}
    </Modal>
  );
}
