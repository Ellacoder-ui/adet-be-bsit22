import dotenv from 'dotenv';
import { pool } from './db.js';

dotenv.config();

async function seed() {
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'student',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS students (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        student_number VARCHAR(50) UNIQUE,
        department VARCHAR(100),
        year_level VARCHAR(20),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS services (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        counter_id INTEGER,
        cashier_id INTEGER,
        queue_number INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS queue (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
        service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
        counter_id INTEGER,
        queue_number INTEGER NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'waiting',
        created_at TIMESTAMP DEFAULT NOW(),
        served_at TIMESTAMP,
        cancelled_at TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        token VARCHAR(255) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    const staffExists = await client.query(`SELECT id FROM users WHERE email = $1`, ['staff1234@liceo.edu.ph']);
    if (staffExists.rowCount === 0) {
      const staffResult = await client.query(
        `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id`,
        ['Staff User', 'staff1234@liceo.edu.ph', 'staff123x', 'staff']
      );
      await client.query(
        `INSERT INTO students (user_id, student_number, department, year_level) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [staffResult.rows[0].id, 'STF-001', 'Administration', 'Staff']
      );
    }

    const sampleStudent = await client.query(`SELECT id FROM users WHERE email = $1`, ['kvbitanghol05181@liceo.edu.ph']);
    if (sampleStudent.rowCount === 0) {
      const studentResult = await client.query(
        `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id`,
        ['Kent Bitanghol', 'kvbitanghol05181@liceo.edu.ph', 'kent123x', 'student']
      );
      await client.query(
        `INSERT INTO students (user_id, student_number, department, year_level) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [studentResult.rows[0].id, '2023-001', 'BSIT', '4th Year']
      );
    }

    const services = ['Tuition & Fees', 'SOA', 'Promissory Note', 'Refund', 'Adjustment'];
    for (const [index, serviceName] of services.entries()) {
      const found = await client.query(`SELECT id FROM services WHERE name = $1`, [serviceName]);
      if (found.rowCount === 0) {
        await client.query(
          `INSERT INTO services (name, counter_id, cashier_id, queue_number) VALUES ($1, $2, $3, $4)`,
          [serviceName, index + 1, index + 1, 0]
        );
      }
    }

    console.log('Database seeded successfully');
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
