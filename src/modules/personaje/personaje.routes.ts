import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { queryOne } from '../../db/client';
import { ok, asyncHandler } from '../../utils/responses';
import { requireAuth, requireRole } from '../../middleware/auth';
import { NotFoundError } from '../../middleware/error-handler';
import type { AuthenticatedRequest } from '../../types';

const router = Router();
router.use(requireAuth);

const capabilitySchema = z.enum([
  'agendar_citas',
  'reprogramar_citas',
  'cancelar_citas',
  'cotizar_servicios',
  'tomar_pedidos',
  'generar_pagos'
]);

const businessHoursDaySchema = z.union([
  z.object({
    open: z.string(),
    close: z.string()
  }).strict(),
  z.object({
    closed: z.literal(true)
  }).strict()
]);

const updateSchema = z.object({
  nombrePersonalizado: z.string().min(1).max(100).optional().nullable(),
  promptPersonalizado: z.string().optional().nullable(),
  avatarPersonalizado: z.string().max(10).optional().nullable(),
  mensajeBienvenida: z.string().max(1000).optional(),
  mensajeFueraDeHorario: z.string().max(500).optional(),
  tono: z.enum(['formal', 'cercano', 'jovial']).optional(),
  frasesPersonalizadas: z.array(z.string().max(200)).max(20).optional(),
  capacidadesActivas: z.array(capabilitySchema).optional(),
  horarios: z.record(businessHoursDaySchema).optional(),
  escalamiento: z.object({
    metodo: z.enum(['whatsapp', 'email', 'esperar']),
    horarioHumano: z.string()
  }).strict().optional()
}).strict();

interface PersonajeRow {
  character_id: string;
  character_slug: string;
  character_vertical: string;
  character_vertical_label: string;
  character_name: string;
  custom_name: string | null;
  character_short_desc: string;
  character_emoji: string;
  custom_emoji: string | null;
  character_color: string;
  base_prompt: string;
  custom_prompt: string | null;
  welcome_message: string | null;
  out_of_hours_message: string | null;
  character_tone: 'formal' | 'cercano' | 'jovial';
  character_phrases: string[];
  active_capabilities: string[];
  business_hours: Record<string, unknown> | null;
  escalation_config: Record<string, unknown>;
}

function toPersonajeResponse(personaje: PersonajeRow) {
  return {
    id: personaje.character_id,
    slug: personaje.character_slug,
    vertical: personaje.character_vertical,
    verticalLabel: personaje.character_vertical_label,
    nombre: personaje.character_name,
    nombrePersonalizado: personaje.custom_name,
    descripcionCorta: personaje.character_short_desc,
    avatarEmoji: personaje.character_emoji,
    avatarPersonalizado: personaje.custom_emoji,
    colorPrimario: personaje.character_color,
    promptBase: personaje.base_prompt,
    promptPersonalizado: personaje.custom_prompt,
    mensajeBienvenida: personaje.welcome_message,
    mensajeFueraDeHorario: personaje.out_of_hours_message,
    tono: personaje.character_tone,
    frasesPersonalizadas: personaje.character_phrases,
    capacidadesActivas: personaje.active_capabilities,
    horarios: personaje.business_hours,
    escalamiento: personaje.escalation_config
  };
}

async function getPersonajeByTenant(tenantId: string) {
  return queryOne<PersonajeRow>(
    `SELECT
       c.id AS character_id,
       c.slug AS character_slug,
       c.vertical AS character_vertical,
       c.vertical_label AS character_vertical_label,
       c.name AS character_name,
       c.short_description AS character_short_desc,
       c.avatar_emoji AS character_emoji,
       c.primary_color AS character_color,
       c.base_prompt,
       t.character_custom_name AS custom_name,
       t.character_custom_prompt AS custom_prompt,
       t.character_custom_emoji AS custom_emoji,
       t.welcome_message,
       t.out_of_hours_message,
       t.character_tone,
       t.character_phrases,
       t.active_capabilities,
       t.business_hours,
       t.escalation_config
     FROM tenants t
     JOIN characters c ON c.id = t.character_id
     WHERE t.id = $1`,
    [tenantId]
  );
}

// GET /api/personaje
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = (req as AuthenticatedRequest).user;
    const personaje = await getPersonajeByTenant(tenantId);

    if (!personaje) throw new NotFoundError('Personaje');

    return ok(res, toPersonajeResponse(personaje));
  })
);

// PATCH /api/personaje
router.patch(
  '/',
  requireRole('owner', 'admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = (req as AuthenticatedRequest).user;
    const updates = updateSchema.parse(req.body);

    const fields: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    const addField = (column: string, value: unknown, jsonb = false) => {
      fields.push(`${column} = $${idx++}${jsonb ? '::jsonb' : ''}`);
      params.push(jsonb ? JSON.stringify(value) : value);
    };

    if (updates.nombrePersonalizado !== undefined) {
      addField('character_custom_name', updates.nombrePersonalizado);
    }
    if (updates.promptPersonalizado !== undefined) {
      addField('character_custom_prompt', updates.promptPersonalizado);
    }
    if (updates.avatarPersonalizado !== undefined) {
      addField('character_custom_emoji', updates.avatarPersonalizado);
    }
    if (updates.mensajeBienvenida !== undefined) {
      addField('welcome_message', updates.mensajeBienvenida);
    }
    if (updates.mensajeFueraDeHorario !== undefined) {
      addField('out_of_hours_message', updates.mensajeFueraDeHorario);
    }
    if (updates.tono !== undefined) {
      addField('character_tone', updates.tono);
    }
    if (updates.frasesPersonalizadas !== undefined) {
      addField('character_phrases', updates.frasesPersonalizadas, true);
    }
    if (updates.capacidadesActivas !== undefined) {
      addField('active_capabilities', updates.capacidadesActivas, true);
    }
    if (updates.horarios !== undefined) {
      addField('business_hours', updates.horarios, true);
    }
    if (updates.escalamiento !== undefined) {
      addField('escalation_config', updates.escalamiento, true);
    }

    if (fields.length === 0) return ok(res, { message: 'Nada que actualizar' });

    params.push(tenantId);
    const updated = await queryOne<{ id: string }>(
      `UPDATE tenants
       SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${idx}
       RETURNING id`,
      params
    );

    if (!updated) throw new NotFoundError('Personaje');

    const personaje = await getPersonajeByTenant(tenantId);
    if (!personaje) throw new NotFoundError('Personaje');

    return ok(res, toPersonajeResponse(personaje));
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
