import { User, Grant, Group } from '../types';

// Grant-aware authorization helpers, mirroring backend/src/middleware/auth.ts.
// Use these instead of reading user.group directly, so multi-role users are
// handled correctly.

// All grants a user holds. Tolerates old-shape user objects (group/site only).
export function userGrants(user: User | null | undefined): Grant[] {
  if (!user) return [];
  if (user.grants && user.grants.length) return user.grants;
  if (user.group) return [{ group: user.group, site: user.site }];
  return [];
}

// Admin is company-wide: an admin grant confers access across all sites.
export function isAdmin(user: User | null | undefined): boolean {
  return userGrants(user).some(g => g.group === 'admin');
}

// True if the user holds `role` at all (any site). Admins pass everything.
export function hasRole(user: User | null | undefined, role: Group): boolean {
  return isAdmin(user) || userGrants(user).some(g => g.group === role);
}

// True if the user holds `role` AT the given site (same grant). Admins pass.
export function hasRoleAtSite(user: User | null | undefined, role: Group, site: string | null | undefined): boolean {
  if (isAdmin(user)) return true;
  if (!site) return false;
  return userGrants(user).some(g => g.group === role && g.site === site);
}

// Every site the user can act on, across all grants (union).
export function userSites(user: User | null | undefined): string[] {
  return Array.from(new Set(userGrants(user).map(g => g.site).filter(Boolean)));
}

// Sites where the user holds a specific role (used to scope role queues).
export function sitesForRole(user: User | null | undefined, role: Group): string[] {
  if (isAdmin(user)) return userSites(user);
  return Array.from(new Set(userGrants(user).filter(g => g.group === role).map(g => g.site)));
}

// The distinct roles the user holds (admin collapses to just 'admin').
export function userRoles(user: User | null | undefined): Group[] {
  return Array.from(new Set(userGrants(user).map(g => g.group)));
}
