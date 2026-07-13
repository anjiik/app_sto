import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JwtPayload, Group } from '../types';

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ message: 'No token provided' });
    return;
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}

export function requireGroup(...groups: Group[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) { res.status(401).json({ message: 'Not authenticated' }); return; }
    if (!can(req.user, ...groups)) {
      res.status(403).json({ message: `Access denied. Required group: ${groups.join(' or ')}` });
      return;
    }
    next();
  };
}

// Returns true if the user is an admin (can do anything) or is in one of the given groups.
export function can(user: JwtPayload, ...groups: Group[]): boolean {
  return user.group === 'admin' || groups.includes(user.group);
}

// All sites a user can act on. Falls back to the single `site` when `sites` is
// absent (older tokens issued before multi-site support).
export function userSites(user: JwtPayload): string[] {
  return user.sites && user.sites.length ? user.sites : [user.site];
}

// True if the given site is one the user is assigned to.
export function userHasSite(user: JwtPayload, site: string | null | undefined): boolean {
  if (!site) return false;
  return userSites(user).includes(site);
}
