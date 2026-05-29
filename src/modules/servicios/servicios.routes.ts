import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { queryOne, queryMany } from '../../db/client';
import { ok, asyncHandler } from '../../utils/responses';
import { requireAuth, requireRole } from '../../middleware/auth';
import { NotFoundError } from '../../middleware/error-handler';
import type { AuthenticatedRequest } from '../../types';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = (req as AuthenticatedRequest).user;

    const servicios = await queryMany(
      `SELECT id, name, description, category, duration_minutes,
              price_usd, is_active, display_order
       FROM services
       WHERE tenant_id = $1
       ORDER BY display_order, name`,
      [tenantId]
    );

    return ok(res, servicios.map((s: any) => ({
      id: s.id,
      nombre: s.name,
      descripcion: s.description,
      categoria: s.category,
      duracionMinutos: s.duration_minutes,
      precio: parseFloat(s.price_usd ?? 0),
      activo: s.is_active,
      orden: s.display_order
    })));
  })
);

const createSchema = z.object({
  nombre: z.string().min(1),
  descripcion: z.string().optional(),
  categoria: z.string().optional(),
  duracionMinutos: z.number().int().min(5).max(480),
  precio: z.number().min(0)
});

router.post(
  '/',
  requireRole('owner', 'admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = (req as AuthenticatedRequest).user;
    const data = createSchema.parse(req.body);

    const servicio = await queryOne(
      `INSERT INTO services (tenant_id, name, description, category, duration_minutes, price_usd)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [tenantId, data.nombre, data.descripcion ?? null, data.categoria ?? null,
       data.duracionMinutos, data.precio]
    );

    return ok(res, servicio, 201);
  })
);

router.patch(
  '/:id',
  requireRole('owner', 'admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = (req as AuthenticatedRequest).user;
    const { id } = req.params;

    const updateSchema = createSchema.partial().extend({
      activo: z.boolean().optional()
    });
    const updates = updateSchema.parse(req.body);

    const map: Record<string, string> = {
      nombre: 'name',
      descripcion: 'description',
      categoria: 'category',
      duracionMinutos: 'duration_minutes',
      precio: 'price_usd',
      activo: 'is_active'
    };

    const fields: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined && map[key]) {
        fields.push(`${map[key]} = $${idx++}`);
        params.push(value);
      }
    }

    if (fields.length === 0) return ok(res, { message: 'Nada que actualizar' });

    params.push(id, tenantId);
    const updated = await queryOne(
      `UPDATE services SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${idx++} AND tenant_id = $${idx}
       RETURNING *`,
      params
    );

    if (!updated) throw new NotFoundError('Servicio');
    return ok(res, updated);
  })
);

router.delete(
  '/:id',
  requireRole('owner', 'admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = (req as AuthenticatedRequest).user;
    const { id } = req.params;

    const result = await queryOne(
      `UPDATE services SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [id, tenantId]
    );

    if (!result) throw new NotFoundError('Servicio');
    return ok(res, { message: 'Servicio desactivado' });
  })
);

export default router;
