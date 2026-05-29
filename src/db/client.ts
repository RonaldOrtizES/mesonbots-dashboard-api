import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { env } from '../config/env';

/**
 * Pool de conexiones a Neon Postgres.
 *
 * IMPORTANTE para Vercel (serverless):
 * - Usamos el connection string del POOLER de Neon (-pooler en el host)
 * - Cada invocación de la función reutiliza este pool en memoria caliente
 * - Cuando Vercel "duerme" la función, el pool se libera automáticamente
 * - Neon Pooler maneja hasta 10,000 conexiones simultáneas (PgBouncer)
 */

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      // Configuración optimizada para serverless
      max: 5,                          // Máximo 5 conexiones por instancia
      idleTimeoutMillis: 10000,        // Cerrar conexiones inactivas en 10s
      connectionTimeoutMillis: 5000,   // Timeout al conectar
      ssl: { rejectUnauthorized: false }
    });

    pool.on('error', (err) => {
      console.error('❌ Error inesperado en el pool de Postgres:', err);
    });
  }
  return pool;
}

/**
 * Ejecuta una query y devuelve los resultados tipados.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await getPool().query<T>(text, params);
    const duration = Date.now() - start;
    if (env.NODE_ENV === 'development' && duration > 100) {
      console.log(`🐢 Query lenta (${duration}ms):`, text.slice(0, 80));
    }
    return result;
  } catch (err) {
    console.error('❌ Error en query:', { text: text.slice(0, 200), error: err });
    throw err;
  }
}

/**
 * Ejecuta una función dentro de una transacción.
 */
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Devuelve la primera fila o null.
 */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const result = await query<T>(text, params);
  return result.rows[0] ?? null;
}

/**
 * Devuelve todas las filas.
 */
export async function queryMany<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await query<T>(text, params);
  return result.rows;
}
