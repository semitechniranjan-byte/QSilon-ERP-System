import { Router, type Request } from 'express';
import { z } from 'zod';
import { one, pool, q } from '../db/pool.js';
import { ah, notFound } from './errors.js';
import { requirePerm } from '../middleware/auth.js';
import { audit } from './audit.js';
import type { Permission } from './permissions.js';

const snake = (s: string) => s.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());

/**
 * Registers list/create/update/delete routes for a simple reference table.
 * Column names come from the zod schema keys (camelCase → snake_case); they are never taken from user input.
 */
export function crud(router: Router, opts: {
  path: string; table: string; schema: z.ZodObject<any>; perm: Permission; readPerm?: Permission | null;
  orderBy?: string; select?: string; where?: (req: Request) => { sql: string; params: unknown[] }; allowDelete?: boolean;
}) {
  const { path, table, schema, perm } = opts;
  const keys = Object.keys(schema.shape);
  const read = opts.readPerm === null ? [] : [requirePerm(opts.readPerm ?? perm)];
  router.get(path, ...read, ah(async (req, res) => {
    const w = opts.where?.(req);
    res.json(await q(`SELECT ${opts.select ?? '*'} FROM ${table} ${w ? 'WHERE ' + w.sql : ''} ORDER BY ${opts.orderBy ?? 'id'}`, w?.params ?? []));
  }));
  router.post(path, requirePerm(perm), ah(async (req, res) => {
    const b = schema.parse(req.body);
    const cols = keys.filter((k) => b[k] !== undefined);
    const row = await one(
      `INSERT INTO ${table} (${cols.map(snake).join(',')}) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`,
      cols.map((k) => b[k]),
    );
    await audit(req, `${table}.create`, table, row.id, b);
    res.status(201).json(row);
  }));
  router.put(`${path}/:id`, requirePerm(perm), ah(async (req, res) => {
    const b = schema.partial().parse(req.body);
    const cols = keys.filter((k) => b[k] !== undefined);
    if (!cols.length) return res.json(await one(`SELECT * FROM ${table} WHERE id = $1`, [req.params.id]));
    const row = await one(
      `UPDATE ${table} SET ${cols.map((k, i) => `${snake(k)} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`,
      [Number(req.params.id), ...cols.map((k) => b[k])],
    );
    if (!row) throw notFound();
    await audit(req, `${table}.update`, table, row.id, b);
    res.json(row);
  }));
  if (opts.allowDelete) {
    router.delete(`${path}/:id`, requirePerm(perm), ah(async (req, res) => {
      const r = await pool.query(`DELETE FROM ${table} WHERE id = $1`, [Number(req.params.id)]);
      if (!r.rowCount) throw notFound();
      await audit(req, `${table}.delete`, table, req.params.id);
      res.json({ ok: true });
    }));
  }
}
