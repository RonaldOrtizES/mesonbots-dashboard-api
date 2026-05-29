import { Router, type Request, type Response } from 'express';
import { queryOne, queryMany } from '../../db/client';
import { ok, asyncHandler } from '../../utils/responses';
import { requireAuth } from '../../middleware/auth';
import { NotFoundError } from '../../middleware/error-handler';
import type { AuthenticatedRequest } from '../../types';

const router = Router();
router.use(requireAuth);

// GET /api/plan
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = (req as AuthenticatedRequest).user;

    const sub = await queryOne<{
      plan: string;
      base_price_usd: string;
      discount_percent: string;
      final_price_usd: string;
      included_notifications: number;
      notifications_used: number;
      included_marketing: number;
      marketing_used: number;
      next_billing_date: Date;
      current_period_start: Date;
      current_period_end: Date;
      loyalty_locked: boolean;
      loyalty_tier: string;
      activated_at: Date | null;
    }>(
      `SELECT
         s.plan, s.base_price_usd, s.discount_percent, s.final_price_usd,
         s.included_notifications, s.notifications_used,
         s.included_marketing, s.marketing_used,
         s.next_billing_date, s.current_period_start, s.current_period_end,
         s.loyalty_locked,
         t.loyalty_tier,
         t.activated_at
       FROM subscriptions s
       JOIN tenants t ON t.id = s.tenant_id
       WHERE s.tenant_id = $1 AND s.status = 'active'
       ORDER BY s.created_at DESC
       LIMIT 1`,
      [tenantId]
    );

    if (!sub) throw new NotFoundError('Suscripción activa');

    return ok(res, {
      plan: sub.plan,
      precioBase: parseFloat(sub.base_price_usd),
      descuentoLealtad: parseFloat(sub.discount_percent),
      precioFinal: parseFloat(sub.final_price_usd),
      notificacionesIncluidas: sub.included_notifications,
      notificacionesUsadas: sub.notifications_used,
      marketingIncluido: sub.included_marketing,
      marketingUsado: sub.marketing_used,
      fechaInicio: sub.current_period_start,
      fechaProximoCobro: sub.next_billing_date,
      bloqueoLealtad: sub.loyalty_locked,
      nivelLealtad: sub.loyalty_tier,
      activadoDesde: sub.activated_at
    });
  })
);

// GET /api/plan/facturas
router.get(
  '/facturas',
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = (req as AuthenticatedRequest).user;

    const facturas = await queryMany<{
      id: string;
      invoice_number: string;
      period_start: Date;
      period_end: Date;
      total_usd: string;
      status: string;
      paid_at: Date | null;
      pdf_url: string | null;
    }>(
      `SELECT id, invoice_number, period_start, period_end,
              total_usd, status, paid_at, pdf_url
       FROM invoices
       WHERE tenant_id = $1
       ORDER BY period_start DESC
       LIMIT 24`,
      [tenantId]
    );

    return ok(res, facturas.map(f => ({
      id: f.id,
      numero: f.invoice_number,
      periodoInicio: f.period_start,
      periodoFin: f.period_end,
      monto: parseFloat(f.total_usd),
      estado: f.status,
      pagadaEn: f.paid_at,
      pdfUrl: f.pdf_url
    })));
  })
);

// GET /api/plan/planes-disponibles
router.get(
  '/planes-disponibles',
  asyncHandler(async (_req: Request, res: Response) => {
    const config = await queryOne<{ value: Record<string, unknown> }>(
      `SELECT value FROM system_config WHERE key = 'plan_limits'`
    );

    return ok(res, config?.value ?? {});
  })
);

export default router;
