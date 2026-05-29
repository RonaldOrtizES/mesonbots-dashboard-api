import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env, corsOrigins } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error-handler';

// Rutas
import authRoutes from './modules/auth/auth.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import conversacionesRoutes from './modules/conversaciones/conversaciones.routes';
import citasRoutes from './modules/citas/citas.routes';
import clientesRoutes from './modules/clientes/clientes.routes';
import personajeRoutes from './modules/personaje/personaje.routes';
import planRoutes from './modules/plan/plan.routes';
import serviciosRoutes from './modules/servicios/servicios.routes';
import webhooksRoutes from './modules/webhooks/webhooks.routes';

export function createApp(): Express {
  const app = express();

  // Seguridad
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  }));

  // CORS
  app.use(cors({
    origin: (origin, callback) => {
      // Permitir requests sin origin (Postman, mobile apps, webhooks)
      if (!origin) return callback(null, true);
      if (corsOrigins.includes(origin) || env.NODE_ENV === 'development') {
        return callback(null, true);
      }
      callback(new Error(`Origin no permitido: ${origin}`));
    },
    credentials: true
  }));

  // Body parsing
  // Twilio envía form-urlencoded
  app.use(express.urlencoded({ extended: true }));
  // Meta envía JSON
  app.use(express.json({ limit: '1mb' }));

  // Rate limiting (excepto webhooks)
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, error: 'Demasiadas peticiones, esperá un momento' }
  });

  // ═══ Health check ═══
  app.get('/', (_req, res) => {
    res.json({
      ok: true,
      service: 'mesonbots-api',
      version: '0.1.0',
      time: new Date().toISOString(),
      message: 'En el mesón siempre hay alguien 🏠'
    });
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });

  // ═══ Webhooks (sin rate limit, Meta/Twilio reintentan) ═══
  app.use('/webhook', webhooksRoutes);

  // ═══ API routes (con rate limit) ═══
  app.use('/api', apiLimiter);
  app.use('/api/auth', authRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/conversaciones', conversacionesRoutes);
  app.use('/api/citas', citasRoutes);
  app.use('/api/clientes', clientesRoutes);
  app.use('/api/personaje', personajeRoutes);
  app.use('/api/plan', planRoutes);
  app.use('/api/servicios', serviciosRoutes);

  // ═══ Error handlers (deben ir al final) ═══
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
