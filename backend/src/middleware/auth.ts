import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JwtPayload, Group, Grant } from '../types';

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
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
    if (!req.user) {
      res.status(401).json({ message: 'Not authenticated' });
      return;
    }
    if (!can(req.user, ...groups)) {
      res.status(403).json({ message: `Access denied. Required group: ${groups.join(' or ')}` });
      return;
    }
    next();
  };
}

// All grants a user holds. Tolerates old-shape tokens (issued before multi-role)
// that only carry `group`/`site` by synthesising a single grant from them, so a
// token minted just before a deploy still authorises correctly.
export function userGrants(user: JwtPayload): Grant[] {
  if (user.grants && user.grants.length) return user.grants;
  if (user.group) return [{ group: user.group, site: user.site }];
  return [];
}

// True if the user holds the admin role anywhere. Admin is company-wide: an admin
// grant confers full access across all sites, regardless of the grant's site.
export function isAdmin(user: JwtPayload): boolean {
  return userGrants(user).some(g => g.group === 'admin');
}

// True if the user is an admin, or holds ANY of the given roles at ANY site.
// Use this only where the action isn't tied to a specific site; for site-scoped
// actions (approvals, edits) use hasRoleAtSite so the role and site must match on
// the SAME grant.
export function can(user: JwtPayload, ...groups: Group[]): boolean {
  if (isAdmin(user)) return true;
  return userGrants(user).some(g => groups.includes(g.group));
}

// True if the user holds `role` at all (any site). Admins pass everything.
export function hasRole(user: JwtPayload, role: Group): boolean {
  return isAdmin(user) || userGrants(user).some(g => g.group === role);
}

// True if the user holds `role` AT the given site on a single grant — the correct
// check for site-scoped workflow actions. Admins pass everything (company-wide).
export function hasRoleAtSite(
  user: JwtPayload,
  role: Group,
  site: string | null | undefined,
): boolean {
  if (isAdmin(user)) return true;
  if (!site) return false;
  return userGrants(user).some(g => g.group === role && g.site === site);
}

// Every site the user can act on, across all their grants (union).
export function userSites(user: JwtPayload): string[] {
  return Array.from(
    new Set(
      userGrants(user)
        .map(g => g.site)
        .filter(Boolean),
    ),
  );
}

// True if the given site is one the user is assigned to (in any role). Admins,
// being company-wide, are treated as belonging to every site.
export function userHasSite(user: JwtPayload, site: string | null | undefined): boolean {
  if (!site) return false;
  if (isAdmin(user)) return true;
  return userSites(user).includes(site);
}
