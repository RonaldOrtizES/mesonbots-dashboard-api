import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { queryOne } from '../../db/client';
import { ok, asyncHandler } from '../../utils/responses';
import { requireAuth, requireRole } from '../../middleware/auth';
import { NotFoundError } from '../../middleware/error-handler';
import type { AuthenticatedRequest } from '../../types';

const router = Router();
router.use(requireAuth);

// GET /api/personaje
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = (req as AuthenticatedRequest).user;

    const personaje = await queryOne<{
      character_id: string;
      character_name: string;
      character_slug: string;
      character_emoji: string;
      character_color: string;
      character_short_desc: string;
      character_vertical: string;
      base_prompt: string;
      custom_name: string | null;
      custom_prompt: string | null;
      business_hours: object;
    }>(
      `SELECT
         c.id AS character_id,
         c.name AS character_name,
         c.slug AS character_slug,
         c.avatar_emoji AS character_emoji,
         c.primary_color AS character_color,
         c.short_description AS character_short_desc,
         c.vertical_label AS character_vertical,
         c.base_prompt,
         t.character_custom_name AS custom_name,
         t.character_custom_prompt AS custom_prompt,
         t.business_hours
       FROM tenants t
       LEFT JOIN characters c ON c.id = t.character_id
       WHERE t.id = $1`,
      [tenantId]
    );

    if (!personaje) throw new NotFoundError('Personaje');

    return ok(res, {
      id: personaje.character_id,
      nombre: personaje.character_name,
      nombrePersonalizado: personaje.custom_name,
      slug: personaje.character_slug,
      descripcionCorta: personaje.character_short_desc,
      vertical: personaje.character_vertical,
      avatarEmoji: personaje.character_emoji,
      colorPrimario: personaje.character_color,
      promptBase: personaje.base_prompt,
      promptPersonalizado: personaje.custom_prompt,
      horarios: personaje.business_hours
    });
  })
);

// PATCH /api/personaje
const updateSchema = z.object({
  nombrePersonalizado: z.string().min(1).max(100).optional().nullable(),
  promptPersonalizado: z.string().optional().nullable(),
  horarios: z.record(z.unknown()).optional()
});

router.patch(
  '/',
  requireRole('owner', 'admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = (req as AuthenticatedRequest).user;
    const updates = updateSchema.parse(req.body);

    const fields: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (updates.nombrePersonalizado !== undefined) {
      fields.push(`character_custom_name = $${idx++}`);
      params.push(updates.nombrePersonalizado);
    }
    if (updates.promptPersonalizado !== undefined) {
      fields.push(`character_custom_prompt = $${idx++}`);
      params.push(updates.promptPersonalizado);
    }
    if (updates.horarios !== undefined) {
      fields.push(`business_hours = $${idx++}::jsonb`);
      params.push(JSON.stringify(updates.horarios));
    }

    if (fields.length === 0) return ok(res, { message: 'Nada que actualizar' });

    params.push(tenantId);
    await queryOne(
      `UPDATE tenants SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${idx}`,
      params
    );

    return ok(res, { message: 'Personaje actualizado' });
  })
);

// GET /api/personaje/disponibles - todos los personajes del Mesón
router.get(
  '/disponibles',
  asyncHandler(async (_req: Request, res: Response) => {
    const personajes = await queryOne(
      `SELECT json_agg(
         json_build_object(
           'id', id,
           'nombre', name,
           'slug', slug,
           'descripcionCorta', short_description,
           'vertical', vertical,
           'verticalLabel', vertical_label,
           'avatarEmoji', avatar_emoji,
           'colorPrimario', primary_color
         ) ORDER BY display_order
       ) AS personajes
       FROM characters
       WHERE is_active = true`
    );

    return ok(res, (personajes as { personajes: unknown[] })?.personajes ?? []);
  })
);

export default router;
