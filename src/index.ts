import dotenv from 'dotenv';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { query, testDbConnection } from './db.js';

dotenv.config();

const fallbackUsers: Array<{
  id: number;
  email: string;
  password_hash: string;
  role: string;
  name: string;
}> = [
  {
    id: 1,
    email: 'kvbitanghol05181@liceo.edu.ph',
    password_hash: 'kent123x',
    role: 'student',
    name: 'Kent Bitanghol',
  },
  {
    id: 2,
    email: 'msantos@liceo.edu.ph',
    password_hash: 'student123',
    role: 'student',
    name: 'Maria Santos',
  },
  {
    id: 3,
    email: 'jdelacruz@liceo.edu.ph',
    password_hash: 'student123',
    role: 'student',
    name: 'Juan Dela Cruz',
  },
  {
    id: 4,
    email: 'arivera@liceo.edu.ph',
    password_hash: 'student123',
    role: 'student',
    name: 'Alex Rivera',
  },
  {
    id: 5,
    email: 'staff1234@liceo.edu.ph',
    password_hash: 'staff123x',
    role: 'staff',
    name: 'Staff User',
  },
  {
    id: 6,
    email: 'cashier2@liceo.edu.ph',
    password_hash: 'staff123',
    role: 'staff',
    name: 'Cashier Counter 2',
  },
  {
    id: 7,
    email: 'cashier3@liceo.edu.ph',
    password_hash: 'staff123',
    role: 'staff',
    name: 'Cashier Counter 3',
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
const fallbackQueueLogs: Array<{
  id: number;
  service_id: number;
  queue_number: number;
  action: string;
  previous_number: number | null;
  undone: number;
  created_at: string;
}> = [];

// Helper function to normalize queue response — map 'id' to 'queue_id' for frontend compatibility
const normalizeQueue = (q: any) => ({
  ...q,
  queue_id: q.queue_id ?? q.id,
  priority_type: q.priority_type || 'regular',
});

async function initDbTables() {
  try {
    await query(`
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
    await query(`
      ALTER TABLE queue ADD COLUMN IF NOT EXISTS priority_type VARCHAR(20) NOT NULL DEFAULT 'regular';
    `);
  } catch (error) {
    // Database connection or table creation failed, fallback mode will handle queries
  }
}
initDbTables();

async function recordQueueLog(serviceId: number, queueNumber: number, action: string, previousNumber: number | null = null) {
  const normAction = String(action).toUpperCase();
  const normServiceId = Number(serviceId);
  const normQueueNumber = Number(queueNumber);
  const normPrev = previousNumber != null ? Number(previousNumber) : null;

  try {
    await query(
      `INSERT INTO queue_logs (service_id, queue_number, action, previous_number, created_at) VALUES ($1, $2, $3, $4, NOW())`,
      [normServiceId, normQueueNumber, normAction, normPrev]
    );
  } catch (error) {
    // Database down or error, record in fallbackQueueLogs
  }

  fallbackQueueLogs.unshift({
    id: Date.now() + Math.floor(Math.random() * 1000),
    service_id: normServiceId,
    queue_number: normQueueNumber,
    action: normAction,
    previous_number: normPrev,
    undone: 0,
    created_at: new Date().toISOString(),
  });
}

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

    // If user does not exist in DB yet, auto-provision so any user can log in
    if (!user) {
      const rawName = email.split('@')[0];
      const formattedName =
        rawName
          .split(/[._-]/)
          .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
          .join(' ') || (role === 'staff' ? 'Staff User' : 'Student User');

      const inserted = await query<any>(
        `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING *`,
        [formattedName, email, password, role]
      );
      user = inserted[0];

      if (user && role === 'student') {
        const studentNum = `STU-${Math.floor(1000 + Math.random() * 9000)}`;
        await query(
          `INSERT INTO students (user_id, student_number, department, year_level) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
          [user.id, studentNum, 'BSIT', 'College']
        );
      }
    }
  } catch (error) {
    // Fallback to in-memory demo users if database is down or disconnected
    let fallback = fallbackUsers.find(
      (candidate) => candidate.email.toLowerCase() === email && candidate.role === role
    );
    if (!fallback) {
      const rawName = email.split('@')[0];
      const formattedName =
        rawName
          .split(/[._-]/)
          .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
          .join(' ') || (role === 'staff' ? 'Staff User' : 'Student User');

      fallback = {
        id: (Date.now() % 90000) + 1000,
        email: email,
        password_hash: password,
        role: role,
        name: formattedName,
      };
      fallbackUsers.push(fallback);
    }
    user = fallback;
  }

  if (!user) {
    return c.json({ success: false, error: 'Invalid credentials.' }, 401);
  }

  if (password !== user.password_hash) {
    return c.json({ success: false, error: 'Invalid credentials. Incorrect password.' }, 401);
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

  try {
    await query(`UPDATE users SET password_hash = $1 WHERE email = $2`, [newPassword, targetEmail]);
  } catch (error) {
    // Database down or error, handled below
  }

  const fb = fallbackUsers.find((u) => u.email.toLowerCase() === targetEmail.toLowerCase());
  if (fb) {
    fb.password_hash = newPassword;
  }

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
  try {
    const rows = await query<any>(`SELECT * FROM students WHERE user_id = $1 LIMIT 1`, [userId]);
    const student = rows[0];

    if (!student) {
      return c.json({
        success: true,
        data: {
          id: userId,
          user_id: userId,
          student_number: `STU-${String(userId).padStart(4, '0')}`,
          department: 'BSIT',
          year_level: 'College',
        },
      });
    }

    return c.json({ success: true, data: student });
  } catch (error) {
    return c.json({
      success: true,
      data: {
        id: userId,
        user_id: userId,
        student_number: `STU-${String(userId).padStart(4, '0')}`,
        department: 'BSIT',
        year_level: 'College',
      },
    });
  }
});

app.get('/api/queues/feed', async (c) => {
  try {
    const services = await query<any>(`SELECT * FROM services ORDER BY id ASC`);

    const feed = [] as any[];
    for (const service of services) {
      const currentRows = await query<any>(`SELECT queue_number FROM queue WHERE service_id = $1 AND status = 'serving' ORDER BY served_at DESC NULLS LAST, created_at ASC LIMIT 1`, [service.id]);
      const waitingCount = await query<any>(`SELECT COUNT(*)::int AS count FROM queue WHERE service_id = $1 AND status = 'waiting'`, [service.id]);
      const lastRows = await query<any>(`SELECT queue_number FROM queue WHERE service_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`, [service.id]);

      let historyRows: any[] = [];
      try {
        historyRows = await query<any>(
          `SELECT id, queue_number as number, action, previous_number, undone, created_at FROM queue_logs WHERE service_id = $1 ORDER BY created_at DESC, id DESC LIMIT 20`,
          [service.id]
        );
      } catch (err) {
        historyRows = [];
      }

      let history = historyRows.map((h) => ({
        id: h.id,
        number: Number(h.number),
        action: h.action,
        previous_number: h.previous_number != null ? Number(h.previous_number) : null,
        undone: Number(h.undone ?? 0),
        created_at: h.created_at,
      }));

      if (history.length === 0) {
        history = fallbackQueueLogs
          .filter((l) => Number(l.service_id) === Number(service.id))
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 20)
          .map((l) => ({
            id: l.id,
            number: Number(l.queue_number),
            action: l.action,
            previous_number: l.previous_number,
            undone: l.undone,
            created_at: l.created_at,
          }));
      }

      feed.push({
        service_id: service.id,
        current_number: currentRows[0]?.queue_number ?? 0,
        waiting_count: waitingCount[0]?.count ?? 0,
        last_number: lastRows[0]?.queue_number ?? 0,
        status: currentRows[0] ? 'active' : 'idle',
        history,
      });
    }

    return c.json({ success: true, data: feed });
  } catch (error) {
    const feed = fallbackServices.map((service) => {
      const serviceQueues = fallbackQueueStore.filter((item) => Number(item.service_id) === service.id);
      const servingQueue = serviceQueues.find((q) => q.status === 'serving');
      const waitingQueues = serviceQueues.filter((q) => q.status === 'waiting');
      const lastQueue = serviceQueues[serviceQueues.length - 1] || {};

      const history = fallbackQueueLogs
        .filter((l) => Number(l.service_id) === service.id)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 20)
        .map((l) => ({
          id: l.id,
          number: Number(l.queue_number),
          action: l.action,
          previous_number: l.previous_number,
          undone: l.undone,
          created_at: l.created_at,
        }));

      return {
        service_id: service.id,
        current_number: servingQueue?.queue_number ?? 0,
        waiting_count: waitingQueues.length,
        last_number: lastQueue?.queue_number ?? 0,
        status: servingQueue ? 'active' : 'idle',
        history,
      };
    });
    return c.json({ success: true, data: feed });
  }
});

app.post('/api/queues/create', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const studentId = Number(body.student_id || body.user_id || 0);
  const serviceId = Number(body.service_id || 0);
  const rawPriority = String(body.priority_type || 'regular').toLowerCase();
  const validPriorities = ['regular', 'pwd', 'pregnant', 'senior', 'faculty'];
  const priorityType = validPriorities.includes(rawPriority) ? rawPriority : 'regular';

  if (!studentId || !serviceId) {
    return c.json({ success: false, error: 'Student and service are required.' }, 400);
  }

  const fallbackService = fallbackServices.find((service) => Number(service.id) === serviceId);

  // Check per-service limit: each student can have at most 2 active queue tickets in the SAME service
  const maxPerService = 2;
  try {
    const activeForService = await query<any>(
      `SELECT id FROM queue WHERE student_id = $1 AND service_id = $2 AND status IN ('waiting', 'serving')`,
      [studentId, serviceId]
    );

    if (activeForService.length >= maxPerService) {
      return c.json({
        success: false,
        error: `You already have ${maxPerService} active queue tickets for this service. Please wait for your current transactions to be completed before queuing again.`,
      }, 400);
    }
  } catch (err) {
    // Fallback: check in-memory store
    const activeFallback = fallbackQueueStore.filter(
      (q) => Number(q.student_id) === studentId &&
             Number(q.service_id) === serviceId &&
             (q.status === 'waiting' || q.status === 'serving')
    );

    if (activeFallback.length >= maxPerService) {
      return c.json({
        success: false,
        error: `You already have ${maxPerService} active queue tickets for this service. Please wait for your current transactions to be completed before queuing again.`,
      }, 400);
    }
  }

  try {
    const maxRow = await query<any>(
      `SELECT COALESCE(MAX(queue_number), 0) AS max_num FROM queue WHERE service_id = $1`,
      [serviceId]
    );
    let nextNumber = (Number(maxRow[0]?.max_num) || 0) + 1;
    if (nextNumber > 999) {
      nextNumber = 1;
    }

    const insertResult = await query<any>(
      `INSERT INTO queue (student_id, service_id, counter_id, queue_number, status, priority_type, created_at) VALUES ($1, $2, $3, $4, 'waiting', $5, NOW()) RETURNING *`,
      [studentId, serviceId, fallbackService?.counter_id ?? 1, nextNumber, priorityType]
    );

    await recordQueueLog(serviceId, nextNumber, 'CREATE');

    return c.json({ success: true, data: normalizeQueue(insertResult[0]) });
  } catch (error) {
    // Fallback: use in-memory queue store
    const serviceQueues = fallbackQueueStore.filter((item) => Number(item.service_id) === serviceId);
    const maxNum = serviceQueues.reduce((max, item) => Math.max(max, Number(item.queue_number) || 0), 0);
    let nextNumber = maxNum + 1;
    if (nextNumber > 999) {
      nextNumber = 1;
    }

    const created = {
      id: Date.now(),
      student_id: studentId,
      service_id: serviceId,
      counter_id: fallbackService?.counter_id ?? 1,
      queue_number: nextNumber,
      status: 'waiting',
      priority_type: priorityType,
      created_at: new Date().toISOString(),
      served_at: null,
    };
    fallbackQueueStore.push(created);
    await recordQueueLog(serviceId, nextNumber, 'CREATE');
    return c.json({ success: true, data: normalizeQueue(created) });
  }
});

app.post('/api/queues/cancel', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const studentId = Number(body.student_id || body.user_id || 0);
  const serviceId = Number(body.service_id || 0);
  const queueId = Number(body.queue_id || 0);

  try {
    if (queueId) {
      await query(`UPDATE queue SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1`, [queueId]);
    } else if (studentId && serviceId) {
      await query(
        `UPDATE queue SET status = 'cancelled', cancelled_at = NOW() WHERE student_id = $1 AND service_id = $2 AND status IN ('waiting', 'serving')`,
        [studentId, serviceId]
      );
    } else if (studentId) {
      await query(
        `UPDATE queue SET status = 'cancelled', cancelled_at = NOW() WHERE student_id = $1 AND status IN ('waiting', 'serving')`,
        [studentId]
      );
    }
    return c.json({ success: true, message: 'Queue cancelled successfully.' });
  } catch (error) {
    if (queueId) {
      const item = fallbackQueueStore.find((q) => q.id === queueId);
      if (item) {
        item.status = 'cancelled';
        item.cancelled_at = new Date().toISOString();
      }
    } else if (studentId && serviceId) {
      fallbackQueueStore.forEach((q) => {
        if (Number(q.student_id) === studentId && Number(q.service_id) === serviceId && (q.status === 'waiting' || q.status === 'serving')) {
          q.status = 'cancelled';
          q.cancelled_at = new Date().toISOString();
        }
      });
    } else if (studentId) {
      fallbackQueueStore.forEach((q) => {
        if (Number(q.student_id) === studentId && (q.status === 'waiting' || q.status === 'serving')) {
          q.status = 'cancelled';
          q.cancelled_at = new Date().toISOString();
        }
      });
    }
    return c.json({ success: true, message: 'Queue cancelled successfully.' });
  }
});

app.get('/api/queues/student/:studentId', async (c) => {
  const studentId = Number(c.req.param('studentId'));
  try {
    const rows = await query<any>(`SELECT * FROM queue WHERE student_id = $1 ORDER BY created_at DESC`, [studentId]);
    return c.json({ success: true, data: rows.map(normalizeQueue) });
  } catch (error) {
    const rows = fallbackQueueStore.filter((item) => Number(item.student_id) === studentId).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return c.json({ success: true, data: rows.map(normalizeQueue) });
  }
});

app.get('/api/queues/by-service/:serviceId', async (c) => {
  const serviceId = Number(c.req.param('serviceId'));
  try {
    const rows = await query<any>(
      `SELECT * FROM queue WHERE service_id = $1 ORDER BY CASE WHEN status = 'waiting' AND priority_type != 'regular' THEN 0 WHEN status = 'waiting' THEN 1 WHEN status = 'serving' THEN 2 ELSE 3 END, created_at ASC, id ASC`,
      [serviceId]
    );
    return c.json({ success: true, data: rows.map(normalizeQueue) });
  } catch (error) {
    const rows = fallbackQueueStore
      .filter((item) => Number(item.service_id) === serviceId)
      .sort((a, b) => {
        const getRank = (item: any) => {
          if (item.status === 'waiting') return (item.priority_type && item.priority_type !== 'regular') ? 0 : 1;
          if (item.status === 'serving') return 2;
          return 3;
        };
        const rankDiff = getRank(a) - getRank(b);
        if (rankDiff !== 0) return rankDiff;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
    return c.json({ success: true, data: rows.map(normalizeQueue) });
  }
});

app.get('/api/queues/counter/:counterId', async (c) => {
  const counterId = Number(c.req.param('counterId'));
  try {
    const rows = await query<any>(`SELECT * FROM queue WHERE counter_id = $1 ORDER BY created_at ASC, id ASC`, [counterId]);
    return c.json({ success: true, data: rows.map(normalizeQueue) });
  } catch (error) {
    const rows = fallbackQueueStore
      .filter((item) => Number(item.counter_id) === counterId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return c.json({ success: true, data: rows.map(normalizeQueue) });
  }
});

app.post('/api/queues/next', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const serviceId = Number(body.service_id || 0);

  if (!serviceId) {
    return c.json({ success: false, error: 'Service is required.' }, 400);
  }

  try {
    const nextRow = await query<any>(
      `SELECT * FROM queue WHERE service_id = $1 AND status = 'waiting' ORDER BY CASE WHEN priority_type != 'regular' THEN 0 ELSE 1 END, created_at ASC, id ASC LIMIT 1`,
      [serviceId]
    );
    const target = nextRow[0];

    if (!target) {
      return c.json({ success: true, data: { serving: null, summary: { current_number: 0 } } });
    }

    const prevServingRows = await query<any>(`SELECT * FROM queue WHERE service_id = $1 AND status = 'serving' ORDER BY served_at DESC NULLS LAST LIMIT 1`, [serviceId]);
    const prevServing = prevServingRows[0];
    const prevNumber = prevServing?.queue_number ?? null;

    if (prevServing) {
      await query(`UPDATE queue SET status = 'done', served_at = NOW() WHERE id = $1`, [prevServing.id]);
      await recordQueueLog(serviceId, prevServing.queue_number, 'DONE');
    }

    await query(`UPDATE queue SET status = 'serving', served_at = NOW() WHERE id = $1`, [target.id]);
    await recordQueueLog(serviceId, target.queue_number, 'NEXT', prevNumber);

    return c.json({
      success: true,
      data: {
        serving: { queue_number: target.queue_number, priority_type: target.priority_type || 'regular' },
        summary: { current_number: target.queue_number },
      },
    });
  } catch (error) {
    const waitingList = fallbackQueueStore
      .filter((item) => Number(item.service_id) === serviceId && item.status === 'waiting')
      .sort((a, b) => {
        const aPrio = a.priority_type && a.priority_type !== 'regular' ? 0 : 1;
        const bPrio = b.priority_type && b.priority_type !== 'regular' ? 0 : 1;
        if (aPrio !== bPrio) return aPrio - bPrio;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });

    const targetQueue = waitingList[0];
    if (!targetQueue) {
      return c.json({ success: true, data: { serving: null, summary: { current_number: 0 } } });
    }

    const prevServing = fallbackQueueStore.find(
      (item) => Number(item.service_id) === serviceId && item.status === 'serving'
    );
    const prevNumber = prevServing ? prevServing.queue_number : null;

    if (prevServing) {
      prevServing.status = 'done';
      prevServing.served_at = new Date().toISOString();
      await recordQueueLog(serviceId, prevServing.queue_number, 'DONE');
    }

    targetQueue.status = 'serving';
    targetQueue.served_at = new Date().toISOString();
    await recordQueueLog(serviceId, targetQueue.queue_number, 'NEXT', prevNumber);

    return c.json({
      success: true,
      data: {
        serving: { queue_number: targetQueue.queue_number, priority_type: targetQueue.priority_type || 'regular' },
        summary: { current_number: targetQueue.queue_number },
      },
    });
  }
});

app.post('/api/queues/set-priority', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const queueId = Number(body.queue_id || 0);
  const rawPriority = String(body.priority_type || 'regular').toLowerCase();
  const validPriorities = ['regular', 'pwd', 'pregnant', 'senior', 'faculty'];
  const priorityType = validPriorities.includes(rawPriority) ? rawPriority : 'regular';

  if (!queueId) {
    return c.json({ success: false, error: 'Queue ID is required.' }, 400);
  }

  try {
    const updateResult = await query<any>(
      `UPDATE queue SET priority_type = $1 WHERE id = $2 RETURNING *`,
      [priorityType, queueId]
    );
    if (!updateResult[0]) {
      return c.json({ success: false, error: 'Queue ticket not found.' }, 404);
    }
    return c.json({ success: true, data: normalizeQueue(updateResult[0]) });
  } catch (error) {
    const item = fallbackQueueStore.find((q) => q.id === queueId);
    if (item) {
      item.priority_type = priorityType;
      return c.json({ success: true, data: normalizeQueue(item) });
    }
    return c.json({ success: false, error: 'Queue ticket not found.' }, 404);
  }
});

app.post('/api/queues/update-status', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const queueId = Number(body.queue_id || 0);
  const serviceId = Number(body.service_id || 0);
  const rawStatus = String(body.status || 'done').toLowerCase();
  const status = rawStatus === 'complete' || rawStatus === 'completed' || rawStatus === 'served' ? 'done' : rawStatus;

  const action = status === 'done'
    ? 'DONE'
    : status === 'skipped' || status === 'skip' || status === 'missed'
    ? 'SKIPPED'
    : status.toUpperCase();

  try {
    let targetQueue: any = null;
    if (queueId) {
      const rows = await query<any>(`SELECT * FROM queue WHERE id = $1 LIMIT 1`, [queueId]);
      targetQueue = rows[0];
    } else if (serviceId) {
      const rows = await query<any>(`SELECT * FROM queue WHERE service_id = $1 AND status = 'serving' ORDER BY served_at DESC NULLS LAST LIMIT 1`, [serviceId]);
      targetQueue = rows[0];
    }

    if (targetQueue) {
      await query(
        `UPDATE queue SET status = $1, served_at = CASE WHEN $1 IN ('done', 'completed', 'served') THEN NOW() ELSE served_at END WHERE id = $2`,
        [status, targetQueue.id]
      );
      await recordQueueLog(targetQueue.service_id, targetQueue.queue_number, action);
      return c.json({
        success: true,
        data: {
          queue_id: targetQueue.id,
          queue_number: targetQueue.queue_number,
          service_id: targetQueue.service_id,
          status,
          action,
        },
      });
    }

    if (queueId) {
      await query(`UPDATE queue SET status = $1 WHERE id = $2`, [status, queueId]);
    }
    return c.json({ success: true, data: { queue_id: queueId, status, action } });
  } catch (error) {
    let queue = queueId ? fallbackQueueStore.find((item) => item.id === queueId) : null;
    if (!queue && serviceId) {
      queue = fallbackQueueStore.find((item) => Number(item.service_id) === serviceId && item.status === 'serving');
    }

    if (queue) {
      queue.status = status;
      if (status === 'done' || status === 'completed' || status === 'served') {
        queue.served_at = new Date().toISOString();
      }
      await recordQueueLog(queue.service_id, queue.queue_number, action);
      return c.json({
        success: true,
        data: {
          queue_id: queue.id,
          queue_number: queue.queue_number,
          service_id: queue.service_id,
          status,
          action,
        },
      });
    }

    return c.json({ success: true, data: { queue_id: queueId, status, action } });
  }
});

app.post('/api/queues/undo', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const serviceId = Number(body.service_id || 0);

  if (!serviceId) {
    return c.json({ success: false, error: 'Service is required.' }, 400);
  }

  try {
    const lastNextRows = await query<any>(
      `SELECT * FROM queue_logs WHERE service_id = $1 AND action = 'NEXT' AND undone = 0 ORDER BY created_at DESC, id DESC LIMIT 1`,
      [serviceId]
    );
    const lastNext = lastNextRows[0];

    if (lastNext) {
      await query(`UPDATE queue_logs SET undone = 1 WHERE id = $1`, [lastNext.id]);
      await recordQueueLog(serviceId, lastNext.queue_number, 'UNDO');
      await query(`UPDATE queue SET status = 'waiting', served_at = NULL WHERE service_id = $1 AND queue_number = $2`, [serviceId, lastNext.queue_number]);

      if (lastNext.previous_number) {
        await query(`UPDATE queue SET status = 'serving' WHERE service_id = $1 AND queue_number = $2`, [serviceId, lastNext.previous_number]);
      }
    }

    return c.json({ success: true, message: 'Last action undone.' });
  } catch (error) {
    const lastNext = fallbackQueueLogs.find((l) => Number(l.service_id) === serviceId && l.action === 'NEXT' && !l.undone);
    if (lastNext) {
      lastNext.undone = 1;
      await recordQueueLog(serviceId, lastNext.queue_number, 'UNDO');

      const target = fallbackQueueStore.find((q) => Number(q.service_id) === serviceId && Number(q.queue_number) === Number(lastNext.queue_number));
      if (target) {
        target.status = 'waiting';
        target.served_at = null;
      }

      if (lastNext.previous_number) {
        const prev = fallbackQueueStore.find((q) => Number(q.service_id) === serviceId && Number(q.queue_number) === Number(lastNext.previous_number));
        if (prev) {
          prev.status = 'serving';
        }
      }
    }

    return c.json({ success: true, message: 'Last action undone.' });
  }
});

app.post('/api/queues/reset/:serviceId', async (c) => {
  const serviceId = Number(c.req.param('serviceId'));
  try {
    await query(`UPDATE queue SET queue_number = 0, status = 'done' WHERE service_id = $1`, [serviceId]);
    await recordQueueLog(serviceId, 0, 'RESET');
    return c.json({ success: true, data: { message: 'Service queue reset to 0.' } });
  } catch (error) {
    fallbackQueueStore.forEach((item) => {
      if (Number(item.service_id) === serviceId) {
        item.queue_number = 0;
        item.status = 'done';
      }
    });
    await recordQueueLog(serviceId, 0, 'RESET');
    return c.json({ success: true, data: { message: 'Service queue reset to 0.' } });
  }
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
  try {
    const logs = await query<any>(`SELECT * FROM queue_logs ORDER BY created_at DESC LIMIT 20`);
    if (logs.length > 0) {
      return c.json(
        logs.map((r) => ({
          id: r.id,
          queueNumber: r.queue_number,
          action: r.action,
          serviceId: r.service_id,
          createdAt: r.created_at,
        }))
      );
    }
  } catch (error) {
    // Fallback if db query fails
  }

  if (fallbackQueueLogs.length > 0) {
    return c.json(
      fallbackQueueLogs.slice(0, 20).map((r) => ({
        id: r.id,
        queueNumber: r.queue_number,
        action: r.action,
        serviceId: r.service_id,
        createdAt: r.created_at,
      }))
    );
  }

  const rows = fallbackQueueStore.slice(-20).reverse();
  return c.json(
    rows.map((r) => ({
      queueNumber: r.queue_number,
      queueType: 'service',
      status: r.status,
      createdAt: r.created_at,
      servedAt: r.served_at,
      cancelledAt: r.cancelled_at,
    }))
  );
});

app.post('/api/queue/mark-served', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const queueNumber = Number(body.queueNumber || 0);
  const counter = String(body.counter || '');
  const serviceId = Number(body.serviceId || 1);

  if (!queueNumber) {
    return c.json({ success: false, error: 'Queue number is required.' }, 400);
  }

  try {
    await query(`UPDATE queue SET status = 'served', served_at = NOW() WHERE queue_number = $1 AND counter_id = $2`, [queueNumber, Number(counter || 0)]);
    await recordQueueLog(serviceId, queueNumber, 'DONE');
  } catch (err) {
    await recordQueueLog(serviceId, queueNumber, 'DONE');
  }
  return c.json({ success: true, data: { queueNumber, counter } });
});

app.post('/api/queue/mark-missed', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const queueNumber = Number(body.queueNumber || 0);
  const counter = String(body.counter || '');
  const serviceId = Number(body.serviceId || 1);

  if (!queueNumber) {
    return c.json({ success: false, error: 'Queue number is required.' }, 400);
  }

  try {
    await query(`UPDATE queue SET status = 'missed', cancelled_at = NOW() WHERE queue_number = $1 AND counter_id = $2`, [queueNumber, Number(counter || 0)]);
    await recordQueueLog(serviceId, queueNumber, 'SKIPPED');
  } catch (err) {
    await recordQueueLog(serviceId, queueNumber, 'SKIPPED');
  }
  return c.json({ success: true, data: { queueNumber, counter } });
});

const port = Number(process.env.PORT || 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`);
});
