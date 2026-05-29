import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { fail } from '../utils/responses';
import type { AuthenticatedRequest } from '../types';

/**
 * Verifica que el request tenga un JWT válido en el header Authorization.
 * Adjunta el payload decodificado a req.user.
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    fail(res, 'Token no proporcionado', 401);
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyToken(token);
    (req as AuthenticatedRequest).user = payload;
    next();
  } catch (err) {
    fail(res, 'Token inválido o expirado', 401);
    return;
  }
}

/**
 * Verifica que el usuario tenga uno de los roles permitidos.
 * Debe usarse DESPUÉS de requireAuth.
 */
export function requireRole(...roles: Array<'owner' | 'admin' | 'staff' | 'viewer'>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as AuthenticatedRequest).user;
    if (!user) {
      fail(res, 'No autenticado', 401);
      return;
    }
    if (!roles.includes(user.role)) {
      fail(res, 'No tenés permisos para esta acción', 403);
      return;
    }
    next();
  };
}
