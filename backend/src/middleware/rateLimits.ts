import rateLimit from 'express-rate-limit';

// Applied to all /api routes — covers normal browsing + page loads
export const apiLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { message: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Applied to write operations (approvals, user management, STO create/edit)
export const writeLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { message: 'Too many requests. Please slow down and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
});
