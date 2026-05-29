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
// GET /api/conversaciones
// ═══════════════════════════════════════════════════

const listQuerySchema = z.object({
  estado: z.enum(['todas', 'open', 'closed', 'escalated', 'archived']).default('todas'),
  busqueda: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = (req as AuthenticatedRequest).user;
    const { estado, busqueda, limit, offset } = listQuerySchema.parse(req.query);

    const conditions: string[] = ['c.tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let paramIdx = 2;

    if (estado !== 'todas') {
      conditions.push(`c.status = $${paramIdx++}`);
      params.push(estado);
    }

    if (busqueda) {
      conditions.push(
        `(c.customer_name ILIKE $${paramIdx} OR c.customer_phone ILIKE $${paramIdx})`
      );
      params.push(`%${busqueda}%`);
      paramIdx++;
    }

    params.push(limit, offset);

    const conversaciones = await queryMany<{
      id: string;
      customer_name: string | null;
      customer_phone: string;
      status: string;
      total_messages: number;
      last_message_at: Date;
      last_message_content: string | null;
      unread_count: number;
    }>(
      `SELECT
         c.id,
         c.customer_name,
         c.customer_phone,
         c.status,
         c.total_messages,
         c.last_message_at,
         (
           SELECT content FROM messages
           WHERE conversation_id = c.id
           ORDER BY created_at DESC LIMIT 1
         ) AS last_message_content,
         (
           SELECT COUNT(*)::int FROM messages
           WHERE conversation_id = c.id
             AND direction = 'inbound'
             AND created_at > COALESCE(c.last_message_at - interval '1 hour', '1970-01-01')
         ) AS unread_count
       FROM conversations c
       WHERE ${conditions.join(' AND ')}
       ORDER BY c.last_message_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      params
    );

    return ok(res, conversaciones.map(c => ({
      id: c.id,
      clienteNombre: c.customer_name ?? c.customer_phone,
      clientePhone: c.customer_phone,
      estado: c.status,
      ultimoMensaje: c.last_message_content ?? '',
      ultimoMensajeFecha: c.last_message_at,
      mensajesNoLeidos: c.unread_count,
      totalMensajes: c.total_messages,
      resuelto: c.status === 'closed'
    })));
  })
);

// ═══════════════════════════════════════════════════
// GET /api/conversaciones/:id
// ═══════════════════════════════════════════════════

router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = (req as AuthenticatedRequest).user;
    const { id } = req.params;

    const conv = await queryOne(
      `SELECT id, customer_name, customer_phone, status, total_messages,
              last_message_at, created_at
       FROM conversations
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (!conv) throw new NotFoundError('Conversación');

    return ok(res, conv);
  })
);

// ═══════════════════════════════════════════════════
// GET /api/conversaciones/:id/mensajes
// ═══════════════════════════════════════════════════

router.get(
  '/:id/mensajes',
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = (req as AuthenticatedRequest).user;
    const { id } = req.params;

    // Verificar que la conversación pertenece al tenant
    const conv = await queryOne(
      `SELECT id FROM conversations WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    if (!conv) throw new NotFoundError('Conversación');

    const mensajes = await queryMany<{
      id: string;
      direction: string;
      message_type: string;
      content: string;
      generated_by_ai: boolean;
      delivery_status: string | null;
      created_at: Date;
    }>(
      `SELECT id, direction, message_type, content, generated_by_ai,
              delivery_status, created_at
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [id]
    );

    return ok(res, mensajes.map(m => ({
      id: m.id,
      conversacionId: id,
      direccion: m.direction,
      tipo: m.message_type,
      contenido: m.content,
      esIA: m.generated_by_ai,
      estadoEntrega: m.delivery_status,
      fecha: m.created_at
    })));
  })
);

// ═══════════════════════════════════════════════════
// PATCH /api/conversaciones/:id/estado
// ═══════════════════════════════════════════════════

const updateEstadoSchema = z.object({
  estado: z.enum(['open', 'closed', 'escalated', 'archived'])
});

router.patch(
  '/:id/estado',
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = (req as AuthenticatedRequest).user;
    const { id } = req.params;
    const { estado } = updateEstadoSchema.parse(req.body);

    const result = await queryOne(
      `UPDATE conversations
       SET status = $1::conversation_status, updated_at = NOW(),
           closed_at = CASE WHEN $1 = 'closed' THEN NOW() ELSE closed_at END
       WHERE id = $2 AND tenant_id = $3
       RETURNING id, status`,
      [estado, id, tenantId]
    );

    if (!result) throw new NotFoundError('Conversación');

    return ok(res, result);
  })
);

export default router;
