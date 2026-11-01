import { Pool } from 'pg';

// Initialize PostgreSQL Connection Pool adhering to Supabase Best Practices
// (conn-pooling, conn-idle-timeout, conn-limits, conn-prepared-statements)
const globalForPg = global as unknown as { pgPool?: Pool };

export const pool =
  globalForPg.pgPool ||
  new Pool({
    connectionString:
      process.env.DATABASE_URL ||
      'postgresql://doh_admin:doh_secure_pass@localhost:5432/doh_pattani_flood',
    max: 10, // Sized based on available CPU/concurrency to prevent exhaustion
    idleTimeoutMillis: 30000, // Reclaim idle connection slots after 30s
    connectionTimeoutMillis: 5000, // Fail fast if database cannot be reached
    statement_timeout: 10000, // Terminate runaway queries exceeding 10s
    query_timeout: 10000,
    allowExitOnIdle: true, // Clean process exit in Node.js
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPg.pgPool = pool;
}

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  try {
    const res = await pool.query(text, params);
    return res.rows as T[];
  } catch (error) {
    // If DB is unreachable during build or initial dev, re-throw or handle gracefully
    console.warn('[PostgreSQL Query Warning]:', (error as Error).message);
    throw error;
  }
}
