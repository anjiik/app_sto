import path from 'path';
import fs from 'fs';
import pino from 'pino';

// Where to write log files. Defaults to backend/logs, overridable via LOG_DIR
// so a service can point logs at a fixed absolute path.
const LOG_DIR = process.env.LOG_DIR || path.resolve(process.cwd(), 'logs');
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_RETENTION_DAYS = parseInt(process.env.LOG_RETENTION_DAYS || '30', 10);

// One plain-text file per calendar day (app-2026-09-01.log). A day boundary
// is a new filename, so this needs no rotation library — a new file just
// starts naturally each day the service is (re)started or crosses midnight
// mid-run gets picked up on the next process start.
function todayFileName(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `app-${yyyy}-${mm}-${dd}.log`;
}

// Ensure the log directory exists before pino-pretty tries to open a file in
// it, and prune files older than LOG_RETENTION_DAYS. Both run synchronously
// at startup so the first write never races the mkdir, and old logs don't
// accumulate forever.
try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const cutoff = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  for (const name of fs.readdirSync(LOG_DIR)) {
    if (!/^app-\d{4}-\d{2}-\d{2}\.log$/.test(name)) continue;
    const filePath = path.join(LOG_DIR, name);
    if (fs.statSync(filePath).mtimeMs < cutoff) fs.unlinkSync(filePath);
  }
} catch (err) {
  // If we can't create/clean the log dir, fall back to console-only rather
  // than crash.
  console.error(`[logger] Could not prepare log dir ${LOG_DIR}:`, err);
}

// Both destinations get the same human-readable, pretty-printed format —
// only the file is durable (survives the app running as a service, where
// stdout is discarded); the console mirror is colourised for local dev.
const fileTarget = {
  target: 'pino-pretty',
  level: LOG_LEVEL,
  options: {
    destination: path.join(LOG_DIR, todayFileName()),
    mkdir: true,
    append: true,
    colorize: false,
    translateTime: 'SYS:standard',
    ignore: 'pid,hostname',
  },
};

const consoleTarget = {
  target: 'pino-pretty',
  level: LOG_LEVEL,
  options: {
    colorize: true,
    translateTime: 'SYS:standard',
    ignore: 'pid,hostname',
  },
};

const logger = pino({
  level: LOG_LEVEL,
  transport: {
    targets: [fileTarget, consoleTarget],
  },
});

logger.info(
  { logDir: LOG_DIR, level: LOG_LEVEL, retentionDays: LOG_RETENTION_DAYS },
  'logger initialised — writing readable logs to file',
);

export default logger;
