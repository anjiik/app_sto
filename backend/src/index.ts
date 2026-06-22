import dotenv from 'dotenv';
dotenv.config(); // must run before any route imports read process.env

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { dbQueryOne, closePool } from './db/connection';
import logger from './lib/logger';
import { apiLimit } from './middleware/rateLimits';
import authRoutes from './routes/auth';
import stoRoutes from './routes/sto';
import approvalRoutes from './routes/approvals';
import analyticsRoutes from './routes/analytics';
import userRoutes from './routes/users';
import siteRoutes from './routes/sites';

// ── Startup env validation ────────────────────────────────────────────────────
// Fail fast rather than silently misbehaving at runtime.
function validateEnv(): void {
  const required: string[] = ['JWT_SECRET', 'DB_SERVER', 'DB_DATABASE'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error(`[startup] Missing required environment variables: ${missing.join(', ')}`);
    console.error('[startup] Copy backend/.env.example to backend/.env and fill in the values.');
    process.exit(1);
  }
  if (process.env.JWT_SECRET === 'change-this-to-a-long-random-secret-in-production') {
    console.error('[startup] JWT_SECRET is set to the example placeholder. Set a strong random value before deploying.');
    process.exit(1);
  }
  if (process.env.DEV_BYPASS !== 'true') {
    const ldapRequired = ['LDAP_URL', 'LDAP_BASE_DN', 'LDAP_APP_GROUP'];
    const missingLdap = ldapRequired.filter(k => !process.env[k]);
    if (missingLdap.length > 0) {
      console.error(`[startup] Missing required LDAP env vars: ${missingLdap.join(', ')}`);
      process.exit(1);
    }
  }
}

validateEnv();

// ── App ───────────────────────────────────────────────────────────────────────

const app = express();
const PORT = parseInt(process.env.PORT || '4000');
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

app.use(helmet());
app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(pinoHttp({ logger }));
app.use('/api/', apiLimit);

app.use('/api/auth', authRoutes);
app.use('/api/sto', stoRoutes);
app.use('/api/sto', approvalRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/users', userRoutes);
app.use('/api/sites', siteRoutes);

app.get('/api/health', async (_req, res) => {
  try {
    await dbQueryOne('SELECT 1 AS ok');
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', timestamp: new Date().toISOString() });
  }
});

const server = app.listen(PORT, () => {
  logger.info({ port: PORT, cors: FRONTEND_ORIGIN, db: process.env.DB_SERVER }, 'STO backend started');
});

function shutdown() {
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
