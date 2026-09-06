import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import servicesRouter from './routes/services.js';
import trackingRouter from './routes/tracking.js';
import applicationsRouter from './routes/applications.js';
import authRouter from './routes/auth.js';
import documentsRouter from './routes/documents.js';
import paymentsRouter from './routes/payments.js';
import printOrdersRouter from './routes/printOrders.js';
import multer from 'multer';
import { query } from './db/pool.js';

const app = express();
const port = Number(process.env.PORT || 3000);

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(v => v.trim()) : true
}));
app.use(express.json({ limit: '1mb' }));

app.get('/api/ping', (_req, res) => {
  res.json({ ok: true, service: 'ayush-janseva-kendra-api', version: '0.8.0' });
});

app.get('/api/health', async (_req, res) => {
  try {
    await query('SELECT 1');
    res.json({ ok: true, database: 'connected', service: 'ayush-janseva-kendra-api', version: '0.8.0' });
  } catch (err) {
    console.error('Database health check failed:', err.message);
    res.status(503).json({ ok: false, database: 'unavailable', service: 'ayush-janseva-kendra-api', version: '0.8.0' });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/services', servicesRouter);
app.use('/api/track', trackingRouter);
app.use('/api/applications', applicationsRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/print-orders', printOrdersRouter);

app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'ROUTE_NOT_FOUND' });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : err.code === 'LIMIT_FILE_COUNT' ? 'TOO_MANY_FILES' : 'UPLOAD_ERROR';
    return res.status(400).json({ ok:false, error:message });
  }
  if (err && err.message === 'Invalid file type') return res.status(400).json({ ok:false, error:'INVALID_FILE_TYPE' });
  res.status(500).json({ ok: false, error: 'INTERNAL_SERVER_ERROR' });
});

app.listen(port, () => {
  console.log(`Ayush Janseva Kendra API listening on http://localhost:${port}`);
});
