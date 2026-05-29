import type { Response } from 'express';

/**
 * Respuesta exitosa estándar.
 */
export function ok<T>(res: Response, data: T, status = 200): Response {
  return res.status(status).json({ ok: true, data });
}

/**
 * Respuesta de error estándar.
 */
export function fail(
  res: Response,
  message: string,
  status = 400,
  details?: unknown
): Response {
  const body: Record<string, unknown> = { ok: false, error: message };
  if (details !== undefined) body['details'] = details;
  return res.status(status).json(body);
}

/**
 * Wrapper para async handlers de Express que captura errores.
 * Express 5 ya hace esto nativo, pero por seguridad lo dejamos.
 */
export function asyncHandler<T extends (...args: any[]) => Promise<any>>(fn: T) {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
