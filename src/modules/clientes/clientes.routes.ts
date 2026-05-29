import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { queryOne, queryMany } from '../../db/client';
import { ok, asyncHandler } from '../../utils/responses';
import { requireAuth } from '../../middleware/auth';
import { NotFoundError } from '../../middleware/error-handler';
import type { AuthenticatedRequest } from '../../types';

const router = Router();
router.use(requireAuth);

// GET /api/clientes
const listSchema = z.object({
  busqueda: z.string().optional(),
  filtro: z.enum(['todos', 'vip', 'frecuentes']).default('todos'),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = (req as AuthenticatedRequest).user;
    const { busqueda, filtro, limit } = listSchema.parse(req.query);

    const conditions: string[] = ['tenant_id = $1', 'is_blocked = false'];
    const params: unknown[] = [tenantId];
    let idx = 2;

    if (filtro === 'vip') conditions.push('is_vip = true');
    if (filtro === 'frecuentes') conditions.push('total_appointments >= 5');

    if (busqueda) {
      conditions.push(`(name ILIKE $${idx} OR whatsapp_phone ILIKE $${idx})`);
      params.push(`%${busqueda}%`);
      idx++;
    }

    params.push(limit);

    const clientes = await queryMany<{
      id: string;
      whatsapp_phone: string;
      name: string | null;
      is_vip: boolean;
      total_conversations: number;
      total_appointments: number;
      last_contact_at: Date;
      notes: string | null;
    }>(
      `SELECT id, whatsapp_phone, name, is_vip,
              total_conversations, total_appointments,
              last_contact_at, notes
       FROM end_customers
       WHERE ${conditions.join(' AND ')}
       ORDER BY last_contact_at DESC
       LIMIT $${idx}`,
      params
    );

    return ok(res, clientes.map(c => ({
      id: c.id,
      nombre: c.name ?? c.whatsapp_phone,
      whatsappPhone: c.whatsapp_phone,
      esVip: c.is_vip,
      totalConversaciones: c.total_conversations,
      totalCitas: c.total_appointments,
      ultimoContacto: c.last_contact_at,
      notas: c.notes
    })));
  })
);

// GET /api/clientes/:id
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = (req as AuthenticatedRequest).user;
    const { id } = req.params;

    const cliente = await queryOne(
      `SELECT id, whatsapp_phone, name, email, is_vip,
              total_conversations, total_appointments,
              first_contact_at, last_contact_at, notes,
              custom_data, opted_in_marketing
       FROM end_customers
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (!cliente) throw new NotFoundError('Cliente');
    return ok(res, cliente);
  })
);

// PATCH /api/clientes/:id
const updateSchema = z.object({
  nombre: z.string().optional(),
  email: z.string().email().optional(),
  esVip: z.boolean().optional(),
  notas: z.string().optional()
});

router.patch(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = (req as AuthenticatedRequest).user;
    const { id } = req.params;
    const updates = updateSchema.parse(req.body);

    const fields: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (updates.nombre !== undefined) {
      fields.push(`name = $${idx++}`);
      params.push(updates.nombre);
    }
    if (updates.email !== undefined) {
      fields.push(`email = $${idx++}`);
      params.push(updates.email);
    }
    if (updates.esVip !== undefined) {
      fields.push(`is_vip = $${idx++}`);
      params.push(updates.esVip);
    }
    if (updates.notas !== undefined) {
      fields.push(`notes = $${idx++}`);
      params.push(updates.notas);
    }

    if (fields.length === 0) return ok(res, { message: 'Nada que actualizar' });

    params.push(id, tenantId);
    const updated = await queryOne(
      `UPDATE end_customers SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${idx++} AND tenant_id = $${idx}
       RETURNING *`,
      params
    );

    if (!updated) throw new NotFoundError('Cliente');
    return ok(res, updated);
  })
);

export default router;
