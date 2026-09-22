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
        priority_type VARCHAR(20) NOT NULL DEFAULT 'regular',
        created_at TIMESTAMP DEFAULT NOW(),
        served_at TIMESTAMP,
        cancelled_at TIMESTAMP
      );
    `);
        await client.query(`
      CREATE TABLE IF NOT EXISTS queue_logs (
        id SERIAL PRIMARY KEY,
        service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
        queue_number INTEGER NOT NULL,
        action VARCHAR(50) NOT NULL,
        previous_number INTEGER,
        undone INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
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
        const seedUsers = [
            { name: 'Kent Bitanghol', email: 'kvbitanghol05181@liceo.edu.ph', password_hash: 'kent123x', role: 'student', student_number: '2023-001', dept: 'BSIT', yr: '4th Year' },
            { name: 'Maria Santos', email: 'msantos@liceo.edu.ph', password_hash: 'student123', role: 'student', student_number: '2023-002', dept: 'BSN', yr: '2nd Year' },
            { name: 'Juan Dela Cruz', email: 'jdelacruz@liceo.edu.ph', password_hash: 'student123', role: 'student', student_number: '2023-003', dept: 'BSBA', yr: '3rd Year' },
            { name: 'Alex Rivera', email: 'arivera@liceo.edu.ph', password_hash: 'student123', role: 'student', student_number: '2023-004', dept: 'BSCS', yr: '1st Year' },
            { name: 'Staff User', email: 'staff1234@liceo.edu.ph', password_hash: 'staff123x', role: 'staff', student_number: 'STF-001', dept: 'Administration', yr: 'Staff' },
            { name: 'Cashier Counter 2', email: 'cashier2@liceo.edu.ph', password_hash: 'staff123', role: 'staff', student_number: 'STF-002', dept: 'Treasury', yr: 'Staff' },
            { name: 'Cashier Counter 3', email: 'cashier3@liceo.edu.ph', password_hash: 'staff123', role: 'staff', student_number: 'STF-003', dept: 'Treasury', yr: 'Staff' },
        ];
        for (const u of seedUsers) {
            const exists = await client.query(`SELECT id FROM users WHERE email = $1`, [u.email]);
            let userId;
            if (exists.rowCount === 0) {
                const insertRes = await client.query(`INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id`, [u.name, u.email, u.password_hash, u.role]);
                userId = insertRes.rows[0].id;
            }
            else {
                userId = exists.rows[0].id;
            }
            await client.query(`INSERT INTO students (user_id, student_number, department, year_level) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`, [userId, u.student_number, u.dept, u.yr]);
        }
        const services = ['Tuition & Fees', 'SOA', 'Promissory Note', 'Refund', 'Adjustment'];
        for (const [index, serviceName] of services.entries()) {
            const found = await client.query(`SELECT id FROM services WHERE name = $1`, [serviceName]);
            if (found.rowCount === 0) {
                await client.query(`INSERT INTO services (name, counter_id, cashier_id, queue_number) VALUES ($1, $2, $3, $4)`, [serviceName, index + 1, index + 1, 0]);
            }
        }
        console.log('Database seeded successfully');
    }
    finally {
        client.release();
        await pool.end();
    }
}
seed().catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
});
