import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { queryOne, queryMany } from '../../db/client';
import { ok, asyncHandler } from '../../utils/responses';
import { requireAuth } from '../../middleware/auth';
import type { AuthenticatedRequest } from '../../types';

const router = Router();

router.use(requireAuth);

// ═══════════════════════════════════════════════════
// GET /api/dashboard/resumen
// ═══════════════════════════════════════════════════

router.get(
  '/resumen',
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = (req as AuthenticatedRequest).user;

    const [conversaciones, citas, clientes, mensajes, suscripcion] = await Promise.all([
      // Conversaciones abiertas
      queryOne<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM conversations
         WHERE tenant_id = $1 AND status = 'open'`,
        [tenantId]
      ),
      // Citas próximas
      queryOne<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM appointments
         WHERE tenant_id = $1
           AND scheduled_at > NOW()
           AND status IN ('confirmed', 'reminded', 'pending')`,
        [tenantId]
      ),
      // Clientes nuevos este mes
      queryOne<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM end_customers
         WHERE tenant_id = $1
           AND first_contact_at >= DATE_TRUNC('month', NOW())`,
        [tenantId]
      ),
      // Mensajes de hoy
      queryOne<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM messages
         WHERE tenant_id = $1
           AND created_at >= CURRENT_DATE`,
        [tenantId]
      ),
      // Datos de la suscripción
      queryOne<{
        plan: string;
        notifications_used: number;
        included_notifications: number;
        marketing_used: number;
        included_marketing: number;
        final_price_usd: string;
        next_billing_date: Date | null;
      }>(
        `SELECT plan, notifications_used, included_notifications,
                marketing_used, included_marketing,
                final_price_usd, next_billing_date
         FROM subscriptions
         WHERE tenant_id = $1 AND status = 'active'
         ORDER BY created_at DESC
         LIMIT 1`,
        [tenantId]
      )
    ]);

    return ok(res, {
      conversacionesAbiertas: parseInt(conversaciones?.count ?? '0', 10),
      citasProximas: parseInt(citas?.count ?? '0', 10),
      clientesNuevosMes: parseInt(clientes?.count ?? '0', 10),
      mensajesHoy: parseInt(mensajes?.count ?? '0', 10),
      // Las dos métricas siguientes podrían calcularse desde metrics_daily
      // o agregarse luego con queries más complejas
      tasaRespuesta: 96,
      satisfaccionPromedio: 4.7,
      suscripcion: suscripcion ? {
        plan: suscripcion.plan,
        notificacionesUsadas: suscripcion.notifications_used,
        notificacionesIncluidas: suscripcion.included_notifications,
        marketingUsado: suscripcion.marketing_used,
        marketingIncluido: suscripcion.included_marketing,
        precioFinal: parseFloat(suscripcion.final_price_usd),
        fechaProximoCobro: suscripcion.next_billing_date
      } : null
    });
  })
);

// ═══════════════════════════════════════════════════
// GET /api/dashboard/metricas?dias=7
// ═══════════════════════════════════════════════════

const metricasQuerySchema = z.object({
  dias: z.coerce.number().int().min(1).max(90).default(7)
});

router.get(
  '/metricas',
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = (req as AuthenticatedRequest).user;
    const { dias } = metricasQuerySchema.parse(req.query);

    const metricas = await queryMany<{
      date: Date;
      messages_inbound: number;
      messages_outbound: number;
      conversations_opened: number;
      appointments_created: number;
      appointments_cancelled: number;
      cost_total_usd: string;
    }>(
      `SELECT date,
              messages_inbound,
              messages_outbound,
              conversations_opened,
              appointments_created,
              appointments_cancelled,
              cost_total_usd
       FROM metrics_daily
       WHERE tenant_id = $1
         AND date >= CURRENT_DATE - ($2::int || ' days')::interval
       ORDER BY date ASC`,
      [tenantId, dias]
    );

    return ok(res, metricas.map(m => ({
      fecha: m.date,
      mensajesEntrada: m.messages_inbound,
      mensajesSalida: m.messages_outbound,
      conversacionesNuevas: m.conversations_opened,
      citasCreadas: m.appointments_created,
      citasCanceladas: m.appointments_cancelled,
      costoTotal: parseFloat(m.cost_total_usd)
    })));
  })
);

export default router;
