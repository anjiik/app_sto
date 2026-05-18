import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { GroupEntry, JwtPayload } from '../types';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// Temp group data — replace with AD group lookup in production.
// Map AD group name → group string, then return a JWT with the same payload shape.
const TEMP_GROUPS: GroupEntry[] = [
  {
    id: 1, name: 'Receiving Site', group: 'receiving_site', plant: 'Plant B',
    description: 'Submit and track material transfer requests',
  },
  {
    id: 2, name: 'Shipping Site Planning', group: 'shipping_planning', plant: 'Plant A',
    description: 'Review and approve incoming transfer requests',
  },
  {
    id: 3, name: 'Shipping Site Logistics', group: 'shipping_logistics', plant: 'Plant A',
    description: 'Coordinate shipment — container, freight, PGI',
  },
  {
    id: 4, name: 'Management', group: 'management', plant: 'ALL',
    description: 'Review and approve high-value transfer orders',
  },
  {
    id: 5, name: 'Finance', group: 'finance', plant: 'ALL',
    description: 'Final financial sign-off on approved orders',
  },
  {
    id: 6, name: 'Receiving Site Logistics', group: 'receiving_logistics', plant: 'Plant B',
    description: 'Confirm receipt and close out delivery',
  },
];

// GET /api/auth/groups — returns group list for the selector UI
router.get('/groups', (_req: Request, res: Response): void => {
  res.json(TEMP_GROUPS.map(g => ({ id: g.id, name: g.name, group: g.group, plant: g.plant, description: g.description })));
});

// POST /api/auth/select-group — { groupId } → JWT
// AD migration: replace this body with an LDAP/Azure AD token exchange.
// The JWT payload shape stays the same — only the source changes.
router.post('/select-group', (req: Request, res: Response): void => {
  const { groupId } = req.body;
  const entry = TEMP_GROUPS.find(g => g.id === groupId);
  if (!entry) { res.status(400).json({ message: 'Invalid group' }); return; }

  const payload: JwtPayload = {
    userId: entry.id,
    group: entry.group,
    name: entry.name,
    plant: entry.plant,
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '8h' });
  res.json({ token, user: payload });
});

// GET /api/auth/me
router.get('/me', authenticate, (req: AuthRequest, res: Response): void => {
  res.json(req.user);
});

export default router;
