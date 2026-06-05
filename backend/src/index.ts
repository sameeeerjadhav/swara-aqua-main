import express from 'express';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';

// Load .env relative to this file's location, not process.cwd()
// This is critical for Hostinger Passenger which changes cwd
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Ensure IST timezone
process.env.TZ = 'Asia/Kolkata';

import authRoutes from './routes/auth.routes';
import adminRoutes from './routes/admin.routes';
import notificationRoutes from './routes/notification.routes';
import orderRoutes from './routes/order.routes';
import inventoryRoutes from './routes/inventory.routes';
import billingRoutes from './routes/billing.routes';
import addressRoutes from './routes/address.routes';
import bannerRoutes from './routes/banner.routes';
import eventsRoutes from './routes/events.routes';
import advanceRoutes from './routes/advance.routes';
import pendingRoutes from './routes/pending.routes';
import subscriptionRoutes from './routes/subscription.routes';
import casualDeliveryRoutes from './routes/casualDelivery.routes';
import { startCronJobs } from './services/cron.service';
import { startKeepAlive } from './services/keepalive.service';
import { runMigrations } from './config/migrate';
import { Request, Response, NextFunction } from 'express';
import './config/firebase';

const app = express();
const isProd = process.env.NODE_ENV === 'production';

// Trust the first proxy hop (Hostinger's reverse proxy / Nginx)
// Required for express-rate-limit to use the real client IP from X-Forwarded-For
if (isProd) {
  app.set('trust proxy', 1);
}

// ── Compression — gzip all responses ─────────────────────────────────────────
app.use(compression());

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

const isAllowedOrigin = (origin: string | undefined): boolean => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  // Hostinger preview / temp domains + production domain variants
  if (/^https:\/\/([a-z0-9-]+\.)*hostingersite\.com$/i.test(origin)) return true;
  if (/^https:\/\/([a-z0-9-]+\.)*labxco\.in$/i.test(origin)) return true;
  if (isProd && /^https:\/\/localhost(:\d+)?$/i.test(origin)) return true;
  return false;
};

app.use(cors({
  origin: (origin, cb) => {
    if (isAllowedOrigin(origin)) return cb(null, true);
    console.warn(`[CORS] Blocked origin: ${origin}`);
    cb(null, false);
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));

// ── Security headers ──────────────────────────────────────────────────────────
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (isProd) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// ── Global API rate limiter — 300 req/min per IP ──────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please slow down.' },
  skip: (req) => req.path === '/health', // don't rate-limit keep-alive pings
});
app.use('/api', globalLimiter);

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/admin',         adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/orders',        orderRoutes);
app.use('/api/inventory',     inventoryRoutes);
app.use('/api/billing',       billingRoutes);
app.use('/api/addresses',     addressRoutes);
app.use('/api/banners',       bannerRoutes);
app.use('/api/events',        eventsRoutes);
app.use('/api/advance',            advanceRoutes);
app.use('/api/pending',            pendingRoutes);
app.use('/api/subscriptions',      subscriptionRoutes);
app.use('/api/casual-deliveries',  casualDeliveryRoutes);

// ── Static files ──────────────────────────────────────────────────────────────
// Use __dirname so paths work regardless of where Passenger sets cwd
const appRoot = path.join(__dirname, '..');
// In production, uploads live in ~/uploads/ (outside app dir, survives redeployments)
// In dev, uploads live in backend/uploads/
const uploadsDir = isProd
  ? path.join(os.homedir(), 'uploads')
  : path.join(appRoot, 'uploads');

app.use('/uploads', express.static(uploadsDir, {
  maxAge: '7d',
  etag: true,
  lastModified: true,
}));
// ── Serve React SPA in production ─────────────────────────────────────────────
if (isProd) {
  const distPath = path.join(appRoot, 'public');
  // Cache static assets for 1 year, HTML for no-cache
  app.use(express.static(distPath, {
    maxAge: '1y',
    etag: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    },
  }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ── Health check ──────────────────────────────────────────────────────────────
import { getClientCount } from './services/sse.service';
app.get('/health', (req, res) => {
  // In production, only expose minimal info publicly
  if (isProd) {
    res.json({ status: 'ok', env: process.env.NODE_ENV });
    return;
  }
  // Dev: full debug info
  res.json({
    status: 'ok',
    env: process.env.NODE_ENV,
    sseClients: getClientCount(),
    cwd: process.cwd(),
    homedir: os.homedir(),
    uploadsDir,
    uploadsDirExists: require('fs').existsSync(uploadsDir),
    uploadsDirFiles: (() => { try { return require('fs').readdirSync(uploadsDir); } catch { return []; } })(),
  });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ message: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const start = async () => {
  // Run migrations — non-fatal, log error but keep starting
  try {
    await runMigrations();
  } catch (err) {
    console.error('⚠️ Migration failed (check DB credentials):', (err as Error).message);
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${port} [${process.env.NODE_ENV || 'development'}]`);
    startCronJobs();
    if (isProd) startKeepAlive();
  });
};

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
