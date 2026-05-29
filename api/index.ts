import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createApp } from '../src/app';

// Reutilizamos la misma instancia de Express entre invocaciones "calientes".
// Esto preserva el pool de conexiones a Postgres y reduce cold starts.
const app = createApp();

export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req as never, res as never);
}
