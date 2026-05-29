import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { fail } from '../utils/responses';
import { env } from '../config/env';

export class AppError extends Error {
  constructor(
    public override message: string,
    public statusCode: number = 400,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} no encontrado`, 404);
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'No autorizado') {
    super(message, 401);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Acceso denegado') {
    super(message, 403);
    this.name = 'ForbiddenError';
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    fail(res, 'Datos inválidos', 400, err.flatten().fieldErrors);
    return;
  }

  if (err instanceof AppError) {
    fail(res, err.message, err.statusCode, err.details);
    return;
  }

  console.error('💥 Error no manejado:', err);

  fail(
    res,
    env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message,
    500,
    env.NODE_ENV === 'production' ? undefined : err.stack
  );
}

export function notFoundHandler(_req: Request, res: Response): void {
  fail(res, 'Ruta no encontrada', 404);
}
