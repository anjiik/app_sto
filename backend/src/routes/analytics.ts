import { Router, Response } from 'express';
import { dbQuery, dbQueryOne } from '../db/connection';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// GET /api/analytics/summary
// KPI cards: totals, value, rush count, avg close days
router.get('/summary', async (_req: AuthRequest, res: Response): Promise<void> => {
  const [counts, value, rush, avgClose] = await Promise.all([
    dbQuery<{ status: string; cnt: number }>(`
      SELECT status, COUNT(*) AS cnt
      FROM sto_requests
      GROUP BY status
    `),
    dbQueryOne<{ total: number; this_month: number }>(`
      SELECT
        SUM(material_value)                                                          AS total,
        SUM(CASE WHEN MONTH(request_date) = MONTH(GETDATE())
                  AND YEAR(request_date)  = YEAR(GETDATE())
             THEN material_value ELSE 0 END)                                        AS this_month
      FROM sto_requests
    `),
    dbQueryOne<{ rush: number; total: number }>(`
      SELECT
        SUM(CASE WHEN rush_request = 1 THEN 1 ELSE 0 END) AS rush,
        COUNT(*)                                            AS total
      FROM sto_requests
    `),
    dbQueryOne<{ avg_days: number }>(`
      SELECT AVG(DATEDIFF(day, request_date, updated_at)) AS avg_days
      FROM sto_requests
      WHERE status = 'CLOSED'
    `),
  ]);

  const statusMap = Object.fromEntries(counts.map(r => [r.status, Number(r.cnt)]));

  res.json({
    total:        counts.reduce((s, r) => s + Number(r.cnt), 0),
    active:       counts.filter(r => !['CLOSED','REJECTED'].includes(r.status)).reduce((s, r) => s + Number(r.cnt), 0),
    closed:       statusMap['CLOSED']   ?? 0,
    rejected:     statusMap['REJECTED'] ?? 0,
    totalValue:   Number(value?.total       ?? 0),
    monthValue:   Number(value?.this_month  ?? 0),
    rushCount:    Number(rush?.rush         ?? 0),
    totalCount:   Number(rush?.total        ?? 0),
    avgCloseDays: Math.round(Number(avgClose?.avg_days ?? 0)),
  });
});

// GET /api/analytics/by-status
// Donut chart data: count per status
router.get('/by-status', async (_req: AuthRequest, res: Response): Promise<void> => {
  const rows = await dbQuery<{ status: string; cnt: number; total_value: number }>(`
    SELECT status, COUNT(*) AS cnt, COALESCE(SUM(material_value), 0) AS total_value
    FROM sto_requests
    GROUP BY status
  `);
  res.json(rows.map(r => ({ status: r.status, count: Number(r.cnt), value: Number(r.total_value) })));
});

// GET /api/analytics/by-month
// Trend line: STOs and value per month for the last 12 months
router.get('/by-month', async (_req: AuthRequest, res: Response): Promise<void> => {
  const rows = await dbQuery<{ month: string; cnt: number; total_value: number }>(`
    SELECT
      FORMAT(request_date, 'yyyy-MM')           AS month,
      COUNT(*)                                   AS cnt,
      COALESCE(SUM(material_value), 0)           AS total_value
    FROM sto_requests
    WHERE request_date >= DATEADD(month, -11, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1))
    GROUP BY FORMAT(request_date, 'yyyy-MM')
    ORDER BY month
  `);
  res.json(rows.map(r => ({ month: r.month, count: Number(r.cnt), value: Number(r.total_value) })));
});

// GET /api/analytics/by-site
// Bar chart: top shipping sites and receiving sites by volume
router.get('/by-site', async (_req: AuthRequest, res: Response): Promise<void> => {
  const [shipping, receiving] = await Promise.all([
    dbQuery<{ site: string; cnt: number; total_value: number }>(`
      SELECT TOP 10
        shipping_site                            AS site,
        COUNT(*)                                  AS cnt,
        COALESCE(SUM(material_value), 0)          AS total_value
      FROM sto_requests
      WHERE shipping_site IS NOT NULL
      GROUP BY shipping_site
      ORDER BY cnt DESC
    `),
    dbQuery<{ site: string; cnt: number }>(`
      SELECT TOP 10
        receiving_site                            AS site,
        COUNT(*)                                   AS cnt
      FROM sto_requests
      WHERE receiving_site IS NOT NULL
      GROUP BY receiving_site
      ORDER BY cnt DESC
    `),
  ]);

  res.json({
    shipping: shipping.map(r => ({ site: r.site, count: Number(r.cnt), value: Number(r.total_value) })),
    receiving: receiving.map(r => ({ site: r.site, count: Number(r.cnt) })),
  });
});

// GET /api/analytics/site-flow
// Site-to-site transfer matrix (top 10 routes)
router.get('/site-flow', async (_req: AuthRequest, res: Response): Promise<void> => {
  const rows = await dbQuery<{ from_site: string; to_site: string; cnt: number; total_value: number }>(`
    SELECT TOP 10
      shipping_site                              AS from_site,
      receiving_site                             AS to_site,
      COUNT(*)                                    AS cnt,
      COALESCE(SUM(material_value), 0)            AS total_value
    FROM sto_requests
    WHERE shipping_site IS NOT NULL AND receiving_site IS NOT NULL
    GROUP BY shipping_site, receiving_site
    ORDER BY cnt DESC
  `);
  res.json(rows.map(r => ({
    from:  r.from_site,
    to:    r.to_site,
    count: Number(r.cnt),
    value: Number(r.total_value),
  })));
});

// GET /api/analytics/rush-split
// Rush vs normal by month (stacked bar)
router.get('/rush-split', async (_req: AuthRequest, res: Response): Promise<void> => {
  const rows = await dbQuery<{ month: string; rush: number; normal: number }>(`
    SELECT
      FORMAT(request_date, 'yyyy-MM')                                   AS month,
      SUM(CASE WHEN rush_request = 1 THEN 1 ELSE 0 END)                 AS rush,
      SUM(CASE WHEN rush_request = 0 THEN 1 ELSE 0 END)                 AS normal
    FROM sto_requests
    WHERE request_date >= DATEADD(month, -11, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1))
    GROUP BY FORMAT(request_date, 'yyyy-MM')
    ORDER BY month
  `);
  res.json(rows.map(r => ({ month: r.month, rush: Number(r.rush), normal: Number(r.normal) })));
});

export default router;
