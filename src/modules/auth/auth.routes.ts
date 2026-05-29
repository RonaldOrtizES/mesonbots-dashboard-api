import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { queryOne } from '../../db/client';
import { signToken } from '../../utils/jwt';
import { ok, asyncHandler } from '../../utils/responses';
import { AppError, UnauthorizedError } from '../../middleware/error-handler';
import { requireAuth } from '../../middleware/auth';
import type { AuthenticatedRequest } from '../../types';

const router = Router();

// ═══════════════════════════════════════════════════
// POST /api/auth/login
// ═══════════════════════════════════════════════════

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Contraseña requerida')
});

interface UserRow {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string;
  password_hash: string;
  role: 'owner' | 'admin' | 'staff' | 'viewer';
  is_active: boolean;
}

router.post(
  '/login',
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = loginSchema.parse(req.body);

    const user = await queryOne<UserRow>(
      `SELECT id, tenant_id, email, full_name, password_hash, role, is_active
       FROM dashboard_users
       WHERE email = $1`,
      [email.toLowerCase()]
    );

    if (!user || !user.is_active) {
      throw new UnauthorizedError('Credenciales inválidas');
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw new UnauthorizedError('Credenciales inválidas');
    }

    const token = signToken({
      userId: user.id,
      tenantId: user.tenant_id,
      email: user.email,
      role: user.role
    });

    // Actualizar último login (no bloqueamos el response por esto)
    queryOne(
      `UPDATE dashboard_users SET last_login_at = NOW() WHERE id = $1`,
      [user.id]
    ).catch(err => console.error('Error actualizando last_login:', err));

    return ok(res, {
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        tenantId: user.tenant_id
      }
    });
  })
);

// ═══════════════════════════════════════════════════
// GET /api/auth/me
// ═══════════════════════════════════════════════════

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = (req as AuthenticatedRequest).user;

    const user = await queryOne<{
      id: string;
      tenant_id: string;
      email: string;
      full_name: string;
      role: string;
      business_name: string;
      character_emoji: string;
      character_name: string;
    }>(
      `SELECT u.id, u.tenant_id, u.email, u.full_name, u.role,
              t.business_name,
              c.avatar_emoji AS character_emoji,
              COALESCE(t.character_custom_name, c.name) AS character_name
       FROM dashboard_users u
       JOIN tenants t ON t.id = u.tenant_id
       LEFT JOIN characters c ON c.id = t.character_id
       WHERE u.id = $1`,
      [userId]
    );

    if (!user) {
      throw new AppError('Usuario no encontrado', 404);
    }

    return ok(res, {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      tenant: {
        id: user.tenant_id,
        businessName: user.business_name,
        character: {
          name: user.character_name,
          emoji: user.character_emoji
        }
      }
    });
  })
);

// ═══════════════════════════════════════════════════
// POST /api/auth/change-password
// ═══════════════════════════════════════════════════

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Mínimo 8 caracteres')
});

router.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = (req as AuthenticatedRequest).user;
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

    const user = await queryOne<{ password_hash: string }>(
      `SELECT password_hash FROM dashboard_users WHERE id = $1`,
      [userId]
    );

    if (!user) throw new AppError('Usuario no encontrado', 404);

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) throw new UnauthorizedError('Contraseña actual incorrecta');

    const newHash = await bcrypt.hash(newPassword, 10);

    await queryOne(
      `UPDATE dashboard_users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [newHash, userId]
    );

    return ok(res, { message: 'Contraseña actualizada' });
  })
);

export default router;
