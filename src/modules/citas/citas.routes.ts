import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { queryOne, queryMany } from '../../db/client';
import { ok, asyncHandler } from '../../utils/responses';
import { requireAuth } from '../../middleware/auth';
import { NotFoundError } from '../../middleware/error-handler';
import type { AuthenticatedRequest } from '../../types';

const router = Router();
router.use(requireAuth);

// ═══════════════════════════════════════════════════
// GET /api/citas
// ═══════════════════════════════════════════════════

const listSchema = z.object({
  desde: z.string().datetime().optional(),
  hasta: z.string().datetime().optional(),
  estado: z.enum([
    'pending', 'confirmed', 'reminded', 'completed',
    'cancelled', 'no_show', 'rescheduled'
  ]).optional()
});

router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = (req as AuthenticatedRequest).user;
    const { desde, hasta, estado } = listSchema.parse(req.query);

    const conditions: string[] = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let idx = 2;

    if (desde) {
      conditions.push(`scheduled_at >= $${idx++}`);
      params.push(desde);
    }
    if (hasta) {
      conditions.push(`scheduled_at <= $${idx++}`);
      params.push(hasta);
    }
    if (estado) {
      conditions.push(`status = $${idx++}::appointment_status`);
      params.push(estado);
    }

    const citas = await queryMany<{
      id: string;
      customer_name: string;
      customer_phone: string;
      service_name: string;
      scheduled_at: Date;
      duration_minutes: number;
      status: string;
      notes: string | null;
    }>(
      `SELECT id, customer_name, customer_phone, service_name,
              scheduled_at, duration_minutes, status, notes
       FROM appointments
       WHERE ${conditions.join(' AND ')}
       ORDER BY scheduled_at ASC`,
      params
    );

    return ok(res, citas.map(c => ({
      id: c.id,
      clienteNombre: c.customer_name,
      clientePhone: c.customer_phone,
      servicio: c.service_name,
      fechaProgramada: c.scheduled_at,
      duracionMinutos: c.duration_minutes,
      estado: c.status,
      notas: c.notes
    })));
  })
);

// ═══════════════════════════════════════════════════
// POST /api/citas
// ═══════════════════════════════════════════════════

const createSchema = z.object({
  clienteNombre: z.string().min(1),
  clientePhone: z.string().min(8),
  servicioId: z.string().uuid().optional(),
  servicioNombre: z.string().min(1),
  fechaProgramada: z.string().datetime(),
  duracionMinutos: z.number().int().min(5).max(480),
  notas: z.string().optional()
});

router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = (req as AuthenticatedRequest).user;
    const data = createSchema.parse(req.body);

    const cita = await queryOne(
      `INSERT INTO appointments
        (tenant_id, customer_name, customer_phone, service_id, service_name,
         scheduled_at, duration_minutes, notes, status, created_via)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'confirmed', 'manual')
       RETURNING *`,
      [
        tenantId,
        data.clienteNombre,
        data.clientePhone,
        data.servicioId ?? null,
        data.servicioNombre,
        data.fechaProgramada,
        data.duracionMinutos,
        data.notas ?? null
      ]
    );

    return ok(res, cita, 201);
  })
);

// ═══════════════════════════════════════════════════
// PATCH /api/citas/:id
// ═══════════════════════════════════════════════════

const updateSchema = z.object({
  fechaProgramada: z.string().datetime().optional(),
  duracionMinutos: z.number().int().min(5).max(480).optional(),
  estado: z.enum([
    'pending', 'confirmed', 'reminded', 'completed',
    'cancelled', 'no_show', 'rescheduled'
  ]).optional(),
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

    if (updates.fechaProgramada !== undefined) {
      fields.push(`scheduled_at = $${idx++}`);
      params.push(updates.fechaProgramada);
    }
    if (updates.duracionMinutos !== undefined) {
      fields.push(`duration_minutes = $${idx++}`);
      params.push(updates.duracionMinutos);
    }
    if (updates.estado !== undefined) {
      fields.push(`status = $${idx++}::appointment_status`);
      params.push(updates.estado);
    }
    if (updates.notas !== undefined) {
      fields.push(`notes = $${idx++}`);
      params.push(updates.notas);
    }

    if (fields.length === 0) {
      return ok(res, { message: 'Nada que actualizar' });
    }

    params.push(id, tenantId);

    const updated = await queryOne(
      `UPDATE appointments
       SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${idx++} AND tenant_id = $${idx}
       RETURNING *`,
      params
    );

    if (!updated) throw new NotFoundError('Cita');
    return ok(res, updated);
  })
);

// ═══════════════════════════════════════════════════
// DELETE /api/citas/:id
// ═══════════════════════════════════════════════════

router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = (req as AuthenticatedRequest).user;
    const { id } = req.params;

    const result = await queryOne(
      `UPDATE appointments
       SET status = 'cancelled'::appointment_status,
           cancelled_at = NOW(),
           cancelled_by = 'business',
           updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING id`,
      [id, tenantId]
    );

    if (!result) throw new NotFoundError('Cita');
    return ok(res, { message: 'Cita cancelada' });
  })
);

export default router;
