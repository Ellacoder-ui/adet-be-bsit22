import dotenv from 'dotenv';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { query, testDbConnection } from './db.js';

dotenv.config();

const fallbackUsers = [
  {
    id: 1,
    email: 'kvbitanghol05181@liceo.edu.ph',
    password_hash: 'kent123x',
    role: 'student',
    name: 'Kent Bitanghol',
  },
  {
    id: 2,
    email: 'staff1234@liceo.edu.ph',
    password_hash: 'staff123x',
    role: 'staff',
    name: 'Staff User',
  },
];

const fallbackServices = [
  { id: 1, name: 'Tuition & Fees', counter_id: 1, cashier_id: 1, queue_number: 0 },
  { id: 2, name: 'SOA', counter_id: 2, cashier_id: 2, queue_number: 0 },
  { id: 3, name: 'Promissory Note', counter_id: 3, cashier_id: 3, queue_number: 0 },
  { id: 4, name: 'Refund', counter_id: 4, cashier_id: 4, queue_number: 0 },
  { id: 5, name: 'Adjustment', counter_id: 5, cashier_id: 5, queue_number: 0 },
];

const fallbackQueueStore: any[] = [];

const app = new Hono();

app.use('*', logger());
app.use('*', cors());

app.get('/health', async (c) => {
  try {
    const now = await testDbConnection();
    return c.json({ success: true, data: { status: 'ok', dbTime: now } });
  } catch (error) {
    return c.json({ success: false, error: 'Database connection failed' }, 500);
  }
});

app.get('/api', (c) => {
  return c.json({ success: true, message: 'Queue system API is running' });
});

app.post('/api/auth/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const role = String(body.role || 'student');

  if (!email || !password) {
    return c.json({ success: false, error: 'Email and password are required.' }, 400);
  }

  let user: any = null;

  try {
    const rows = await query<any>(`SELECT * FROM users WHERE email = $1 AND role = $2 LIMIT 1`, [email, role]);
    user = rows[0] ?? null;
  } catch (error) {
    // Fallback to hardcoded demo users if database is down
    const fallback = fallbackUsers.find(
      (candidate) => candidate.email.toLowerCase() === email && candidate.role === role
    );
    if (fallback) {
      user = fallback;
    }
  }

  if (!user) {
    return c.json({ success: false, error: 'Invalid credentials.' }, 401);
  }

  if (password !== user.password_hash) {
    return c.json({ success: false, error: 'Invalid credentials.' }, 401);
  }

  const token = `mock-token-${user.id}-${Date.now()}`;
  let studentId = null;

  // For students, try to get their student_id from database
  if (user.role === 'student') {
    try {
      const studentRows = await query<any>(`SELECT id FROM students WHERE user_id = $1 LIMIT 1`, [user.id]);
      studentId = studentRows[0]?.id ?? user.id;
    } catch (error) {
      // If database is down or no student record, use userId as fallback
      studentId = user.id;
    }
  }

  return c.json({
    success: true,
    data: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      token,
      student_id: studentId,
      assigned_service_id: null,
    },
  });
});

app.post('/api/auth/forgot-password', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();

  if (!email) {
    return c.json({ success: false, error: 'Email is required.' }, 400);
  }

  const token = `reset-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  await query(
    `INSERT INTO password_resets (email, token, expires_at) VALUES ($1, $2, $3) ON CONFLICT (token) DO NOTHING`,
    [email, token, expiresAt]
  );

  return c.json({ success: true, message: 'Reset token generated successfully.' });
});

app.get('/api/auth/verify-reset-token', async (c) => {
  const token = String(c.req.query('token') || '');
  if (!token) {
    return c.json({ success: false, error: 'Token is required.' }, 400);
  }

  const rows = await query<any>(`SELECT email FROM password_resets WHERE token = $1 AND expires_at > NOW() LIMIT 1`, [token]);
  const reset = rows[0];

  if (!reset) {
    return c.json({ success: false, error: 'Invalid or expired reset token.' }, 400);
  }

  return c.json({ success: true, email: reset.email });
});

app.post('/api/auth/reset-password', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const token = String(body.token || '');
  const email = String(body.email || '').trim().toLowerCase();
  const newPassword = String(body.newPassword || '');

  if (!newPassword) {
    return c.json({ success: false, error: 'New password is required.' }, 400);
  }

  let targetEmail = email;
  if (token) {
    const rows = await query<any>(`SELECT email FROM password_resets WHERE token = $1 AND expires_at > NOW() LIMIT 1`, [token]);
    const reset = rows[0];
    if (!reset) {
      return c.json({ success: false, error: 'Invalid or expired token.' }, 400);
    }
    targetEmail = reset.email;
  }

  await query(`UPDATE users SET password_hash = $1 WHERE email = $2`, [newPassword, targetEmail]);

  return c.json({ success: true, message: 'Password updated successfully.' });
});

app.get('/api/services', async (c) => {
  const rows = await query<any>(`SELECT * FROM services ORDER BY id ASC`);
  return c.json({ success: true, data: rows });
});

app.get('/api/services/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const rows = await query<any>(`SELECT * FROM services WHERE id = $1 LIMIT 1`, [id]);
  const service = rows[0];

  if (!service) {
    return c.json({ success: false, error: 'Service not found.' }, 404);
  }

  return c.json({ success: true, data: service });
});

app.get('/api/services/counter/:counterId', async (c) => {
  const counterId = Number(c.req.param('counterId'));
  const rows = await query<any>(`SELECT * FROM services WHERE counter_id = $1 ORDER BY id ASC`, [counterId]);
  return c.json({ success: true, data: rows });
});

app.get('/api/students/user/:userId', async (c) => {
  const userId = Number(c.req.param('userId'));
  const rows = await query<any>(`SELECT * FROM students WHERE user_id = $1 LIMIT 1`, [userId]);
  const student = rows[0];

  if (!student) {
    return c.json({ success: false, error: 'Student not found.' }, 404);
  }

  return c.json({ success: true, data: student });
});

app.get('/api/queues/feed', async (c) => {
  const services = await query<any>(`SELECT * FROM services ORDER BY id ASC`);

  const feed = [] as any[];
  for (const service of services) {
    const currentRows = await query<any>(`SELECT queue_number FROM queue WHERE service_id = $1 AND status = 'serving' ORDER BY served_at DESC NULLS LAST, created_at ASC LIMIT 1`, [service.id]);
    const waitingCount = await query<any>(`SELECT COUNT(*)::int AS count FROM queue WHERE service_id = $1 AND status = 'waiting'`, [service.id]);
    const lastRows = await query<any>(`SELECT queue_number FROM queue WHERE service_id = $1 ORDER BY queue_number DESC LIMIT 1`, [service.id]);

    feed.push({
      service_id: service.id,
      current_number: currentRows[0]?.queue_number ?? 0,
      waiting_count: waitingCount[0]?.count ?? 0,
      last_number: lastRows[0]?.queue_number ?? 0,
      status: currentRows[0] ? 'active' : 'idle',
      history: [],
    });
  }

  return c.json({ success: true, data: feed });
});

app.post('/api/queues/create', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const studentId = Number(body.student_id || body.user_id || 0);
  const serviceId = Number(body.service_id || 0);

  if (!studentId || !serviceId) {
    return c.json({ success: false, error: 'Student and service are required.' }, 400);
  }

  const fallbackService = fallbackServices.find((service) => Number(service.id) === serviceId);

  try {
    const lastRow = await query<any>(`SELECT queue_number FROM queue WHERE service_id = $1 ORDER BY queue_number DESC LIMIT 1`, [serviceId]);
    const nextNumber = (lastRow[0]?.queue_number ?? 0) + 1;

    const insertResult = await query<any>(
      `INSERT INTO queue (student_id, service_id, counter_id, queue_number, status, created_at) VALUES ($1, $2, $3, $4, 'waiting', NOW()) RETURNING *`,
      [studentId, serviceId, 1, nextNumber]
    );

    return c.json({ success: true, data: insertResult[0] });
  } catch (error) {
    // Fallback: use in-memory queue store
    const fallbackQueueEntries = fallbackQueueStore.filter((item) => Number(item.service_id) === serviceId);
    const nextNumber = (fallbackQueueEntries.at(-1)?.queue_number ?? 0) + 1;
    const created = {
      id: Date.now(),
      student_id: studentId,
      service_id: serviceId,
      counter_id: fallbackService?.counter_id ?? 1,
      queue_number: nextNumber,
      status: 'waiting',
      created_at: new Date().toISOString(),
      served_at: null,
    };
    fallbackQueueStore.push(created);
    return c.json({ success: true, data: created });
  }
});

app.get('/api/queues/student/:studentId', async (c) => {
  const studentId = Number(c.req.param('studentId'));
  const rows = await query<any>(`SELECT * FROM queue WHERE student_id = $1 ORDER BY created_at DESC`, [studentId]);
  return c.json({ success: true, data: rows });
});

app.get('/api/queues/by-service/:serviceId', async (c) => {
  const serviceId = Number(c.req.param('serviceId'));
  const rows = await query<any>(`SELECT * FROM queue WHERE service_id = $1 ORDER BY queue_number ASC`, [serviceId]);
  return c.json({ success: true, data: rows });
});

app.get('/api/queues/counter/:counterId', async (c) => {
  const counterId = Number(c.req.param('counterId'));
  const rows = await query<any>(`SELECT * FROM queue WHERE counter_id = $1 ORDER BY queue_number ASC`, [counterId]);
  return c.json({ success: true, data: rows });
});

app.post('/api/queues/next', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const serviceId = Number(body.service_id || 0);

  if (!serviceId) {
    return c.json({ success: false, error: 'Service is required.' }, 400);
  }

  const nextRow = await query<any>(`SELECT * FROM queue WHERE service_id = $1 AND status = 'waiting' ORDER BY queue_number ASC LIMIT 1`, [serviceId]);
  const target = nextRow[0];

  if (!target) {
    return c.json({ success: true, data: { serving: null, summary: { current_number: 0 } } });
  }

  await query(`UPDATE queue SET status = 'serving', served_at = NOW() WHERE id = $1`, [target.id]);

  return c.json({
    success: true,
    data: {
      serving: { queue_number: target.queue_number },
      summary: { current_number: target.queue_number },
    },
  });
});

app.post('/api/queues/update-status', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const queueId = Number(body.queue_id || 0);
  const status = String(body.status || 'done');

  if (!queueId) {
    return c.json({ success: false, error: 'Queue id is required.' }, 400);
  }

  await query(`UPDATE queue SET status = $1 WHERE id = $2`, [status, queueId]);
  return c.json({ success: true, data: { queue_id: queueId, status } });
});

app.post('/api/queues/reset/:serviceId', async (c) => {
  const serviceId = Number(c.req.param('serviceId'));
  await query(`UPDATE queue SET queue_number = 0 WHERE service_id = $1`, [serviceId]);
  return c.json({ success: true, data: { message: 'Service queue reset to 0.' } });
});

app.get('/api/queue/home', async (c) => {
  const rows = await query<any>(`SELECT * FROM services ORDER BY id ASC`);
  const firstService = rows[0];
  return c.json({
    nowServing: firstService ? 0 : null,
    myQueueNumber: null,
    counter: null,
    peopleAhead: 0,
    estimatedWaitMinutes: 0,
    queueAvailable: true,
  });
});

app.get('/api/queue/history', async (c) => {
  const rows = await query<any>(`SELECT * FROM queue ORDER BY created_at DESC LIMIT 20`);
  return c.json(rows.map((r) => ({
    queueNumber: r.queue_number,
    queueType: 'service',
    status: r.status,
    createdAt: r.created_at,
    servedAt: r.served_at,
    cancelledAt: r.cancelled_at,
  })));
});

app.post('/api/queue/mark-served', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const queueNumber = Number(body.queueNumber || 0);
  const counter = String(body.counter || '');

  if (!queueNumber) {
    return c.json({ success: false, error: 'Queue number is required.' }, 400);
  }

  await query(`UPDATE queue SET status = 'served' WHERE queue_number = $1 AND counter_id = $2`, [queueNumber, Number(counter || 0)]);
  return c.json({ success: true, data: { queueNumber, counter } });
});

app.post('/api/queue/mark-missed', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const queueNumber = Number(body.queueNumber || 0);
  const counter = String(body.counter || '');

  if (!queueNumber) {
    return c.json({ success: false, error: 'Queue number is required.' }, 400);
  }

  await query(`UPDATE queue SET status = 'missed' WHERE queue_number = $1 AND counter_id = $2`, [queueNumber, Number(counter || 0)]);
  return c.json({ success: true, data: { queueNumber, counter } });
});

const port = Number(process.env.PORT || 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`);
});
