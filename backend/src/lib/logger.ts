import path from 'path';
import fs from 'fs';
import pino from 'pino';

// Where to write rotated log files. Defaults to backend/logs, overridable via
// LOG_DIR so a service can point logs at a fixed absolute path.
const LOG_DIR = process.env.LOG_DIR || path.resolve(process.cwd(), 'logs');
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const isProd = process.env.NODE_ENV === 'production';

// Ensure the log directory exists before pino-roll tries to open a file in it.
// Created synchronously at startup so the first write never races the mkdir.
try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
} catch (err) {
  // If we can't create the log dir, fall back to console-only rather than crash.
  console.error(`[logger] Could not create log dir ${LOG_DIR}:`, err);
}

// Always write durable JSON logs to a rotating file. This is what makes logs
// survive when the app runs as a service (where stdout is discarded). Files
// rotate daily and are size-capped; old files are pruned by `limit.count`.
const fileTarget = {
  target: 'pino-roll',
  level: LOG_LEVEL,
  options: {
    file: path.join(LOG_DIR, 'app'),
    extension: '.log',
    frequency: 'daily', // new file each day: app.<date>.log
    size: '20m', // also roll when a file passes 20 MB
    limit: { count: 30 }, // keep the 30 most recent files
    mkdir: true,
    dateFormat: 'yyyy-MM-dd',
  },
};

// In dev, also mirror pretty, colourised logs to the console. In production we
// keep a plain JSON stdout stream too, in case the service manager DOES capture
// stdout — harmless duplication, and the file remains the source of truth.
const consoleTarget = isProd
  ? { target: 'pino/file', level: LOG_LEVEL, options: { destination: 1 } }
  : {
      target: 'pino-pretty',
      level: LOG_LEVEL,
      options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
    };

const logger = pino({
  level: LOG_LEVEL,
  transport: {
    targets: [fileTarget, consoleTarget],
  },
});

logger.info({ logDir: LOG_DIR, level: LOG_LEVEL }, 'logger initialised — writing to rotating file');

export default logger;
