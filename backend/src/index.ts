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
import siteRoutes from './routes/sites';
import adminRoutes from './routes/admin';
import attachmentRoutes from './routes/attachments';

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
    console.error(
      '[startup] JWT_SECRET is set to the example placeholder. Set a strong random value before deploying.',
    );
    process.exit(1);
  }
  if (process.env.DEV_BYPASS !== 'true') {
    const ldapRequired = ['LDAP_URL', 'LDAP_BASE_DN'];
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

// Capture the JSON body a route sends via res.json() so the log line below can
// include the actual { message: '...' } (e.g. "Invalid username or password",
// "not in any STO application group") instead of just a bare status code.
// Must run before pinoHttp so the wrapped res.json is what routes actually call.
app.use((_req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    (res as express.Response & { locals: { loggedBody?: unknown } }).locals.loggedBody = body;
    return originalJson(body);
  };
  next();
});

// Only log HTTP requests that actually failed (4xx/5xx) or errored — a
// successful request logs nothing, so routine traffic (dashboard polling,
// list/analytics fetches, etc.) doesn't fill the log with noise. Real
// failures still get a line, including the status code and any thrown error.
// req/res are trimmed to the essentials (method, URL, status, timing) —
// the default serializers dump full headers, which is a lot of scroll for
// something rarely needed when scanning a day's errors.
function responseMessage(res: express.Response): string {
  const body = res.locals.loggedBody as { message?: string } | undefined;
  return body?.message ? ` — ${body.message}` : '';
}
app.use(
  pinoHttp({
    logger,
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'silent';
    },
    // Default pino-http messages are just "request completed" / "request
    // errored" — put the method, URL, status code, AND the actual response
    // message (e.g. "Invalid username or password") in the log line, so the
    // log file alone is enough to diagnose a failure without reproducing it.
    customSuccessMessage: (req, res) =>
      `${req.method} ${req.url} ${res.statusCode}${responseMessage(res)}`,
    customErrorMessage: (req, res, err) =>
      `${req.method} ${req.url} ${res.statusCode} — ${err.message}`,
    serializers: {
      req: req => ({ method: req.method, url: req.url }),
      res: res => ({ statusCode: res.statusCode }),
    },
  }),
);
app.use('/api/', apiLimit);

app.use('/api/auth', authRoutes);
app.use('/api/sto', stoRoutes);
app.use('/api/sto', approvalRoutes);
app.use('/api/sto', attachmentRoutes);
app.use('/api/analytics', analyticsRoutes);

app.use('/api/sites', siteRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', async (_req, res) => {
  try {
    await dbQueryOne('SELECT 1 AS ok');
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', timestamp: new Date().toISOString() });
  }
});

// Catch-all for errors that escape a route's own try/catch (e.g. thrown
// synchronously in middleware, or by a route that forgot one). Without this,
// Express falls back to its default HTML error handler, which can leak stack
// traces to the client. Must be registered last, after all routes.
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err, path: req.path }, 'unhandled route error');
  if (res.headersSent) return;
  res.status(500).json({ message: 'Internal server error' });
});

const server = app.listen(PORT, () => {
  logger.info(
    { port: PORT, cors: FRONTEND_ORIGIN, db: process.env.DB_SERVER },
    'STO backend started',
  );
});

function shutdown() {
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Last-resort safety nets. Without these, an unhandled promise rejection (e.g.
// a fire-and-forget call that throws) or a truly uncaught exception crashes
// the Node process with no log line and no graceful recovery — under a
// service manager that just means the whole app silently drops until the
// next restart. Log what happened, then exit so the service manager restarts
// us into a known-good state rather than continuing in a possibly-corrupted one.
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'unhandled promise rejection');
});
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'uncaught exception — shutting down');
  shutdown();
});
