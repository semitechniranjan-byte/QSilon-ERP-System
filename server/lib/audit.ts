import type { Request } from 'express';
import { pool, type Db } from '../db/pool.js';

export async function audit(
  req: Request | null,
  action: string,
  entityType: string,
  entityId: string | number | null,
  details?: Record<string, unknown>,
  db: Db = pool,
) {
  await db.query(
    'INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details, ip) VALUES ($1,$2,$3,$4,$5,$6)',
    [req?.user?.id ?? null, action, entityType, entityId == null ? null : String(entityId), details ? JSON.stringify(details) : null, req?.ip ?? null],
  );
}
