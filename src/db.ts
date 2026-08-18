import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
});

export async function testDbConnection() {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT NOW() AS now');
    return result.rows[0].now;
  } finally {
    client.release();
  }
}

export async function query<T = any>(text: string, params: any[] = []) {
  const result = await pool.query<any>(text, params);
  return result.rows as T[];
}
