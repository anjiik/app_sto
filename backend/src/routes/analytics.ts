import { Router, Response } from 'express';
import { dbQuery, dbQueryOne } from '../db/connection';
import { authenticate, AuthRequest } from '../middleware/auth';
import logger from '../lib/logger';

const router = Router();
router.use(authenticate);

// Build WHERE conditions from filter query params (client-supplied, non-scoped)
function buildFilters(q: Record<string, string>): {
  conds: string[];
  params: Record<string, unknown>;
} {
  const conds: string[] = ['archived = 0'];
  const params: Record<string, unknown> = {};
  if (q.status) {
    conds.push('status = @status');
    params.status = q.status;
  }
  if (q.rush === '1') conds.push('rush_request = 1');
  else if (q.rush === '0') conds.push('rush_request = 0');
  if (q.dateFrom) {
    conds.push('request_date >= @dateFrom');
    params.dateFrom = q.dateFrom + '-01';
  }
  if (q.dateTo) {
    conds.push('request_date < DATEADD(month, 1, @dateTo)');
    params.dateTo = q.dateTo + '-01';
  }
  return { conds, params };
}

function toWhere(conds: string[]): string {
  return conds.length ? 'WHERE ' + conds.join(' AND ') : '';
}

// GET /api/analytics/summary
router.get('/summary', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { conds, params } = buildFilters(req.query as Record<string, string>);
    const where = toWhere(conds);
    const closedWhere = toWhere([...conds, "status = 'CLOSED'"]);

    const [counts, value, rush, avgClose, di, onTime] = await Promise.all([
      dbQuery<{ status: string; cnt: number }>(
        `
        SELECT status, COUNT(*) AS cnt FROM sto_requests ${where} GROUP BY status
      `,
        params,
      ),
      dbQueryOne<{ total: number; this_month: number }>(
        `
        SELECT SUM(material_value) AS total,
               SUM(CASE WHEN MONTH(request_date) = MONTH(GETDATE()) AND YEAR(request_date) = YEAR(GETDATE())
                    THEN material_value ELSE 0 END) AS this_month
        FROM sto_requests ${where}
      `,
        params,
      ),
      dbQueryOne<{ rush: number; total: number }>(
        `
        SELECT SUM(CASE WHEN rush_request = 1 THEN 1 ELSE 0 END) AS rush, COUNT(*) AS total
        FROM sto_requests ${where}
      `,
        params,
      ),
      dbQueryOne<{ avg_days: number }>(
        `
        SELECT AVG(DATEDIFF(day, request_date, updated_at)) AS avg_days
        FROM sto_requests ${closedWhere}
      `,
        params,
      ),
      // Distressed Inventory savings: realised on CLOSED STOs, potential on
      // still-active ones (not CLOSED and not REJECTED).
      dbQueryOne<{ realized: number; potential: number }>(
        `
        SELECT
          SUM(CASE WHEN status = 'CLOSED' THEN di_value ELSE 0 END) AS realized,
          SUM(CASE WHEN status NOT IN ('CLOSED', 'REJECTED') THEN di_value ELSE 0 END) AS potential
        FROM sto_requests ${toWhere([...conds, 'distressed_inventory = 1'])}
      `,
        params,
      ),
      // On-time delivery: of CLOSED STOs that had both a need-by date and an
      // actual receipt date, how many were received on or before the need-by.
      dbQueryOne<{ measured: number; on_time: number }>(
        `
        SELECT
          COUNT(*) AS measured,
          SUM(CASE WHEN actual_receipt_date <= receiving_site_need_by_date THEN 1 ELSE 0 END) AS on_time
        FROM sto_requests
        ${toWhere([
          ...conds,
          "status = 'CLOSED'",
          'receiving_site_need_by_date IS NOT NULL',
          'actual_receipt_date IS NOT NULL',
        ])}
      `,
        params,
      ),
    ]);

    const measured = Number(onTime?.measured ?? 0);
    const onTimeCount = Number(onTime?.on_time ?? 0);

    const statusMap = Object.fromEntries(counts.map(r => [r.status, Number(r.cnt)]));
    res.json({
      total: counts.reduce((s, r) => s + Number(r.cnt), 0),
      active: counts
        .filter(r => !['CLOSED', 'REJECTED'].includes(r.status))
        .reduce((s, r) => s + Number(r.cnt), 0),
      closed: statusMap['CLOSED'] ?? 0,
      rejected: statusMap['REJECTED'] ?? 0,
      totalValue: Number(value?.total ?? 0),
      monthValue: Number(value?.this_month ?? 0),
      rushCount: Number(rush?.rush ?? 0),
      totalCount: Number(rush?.total ?? 0),
      avgCloseDays: Math.round(Number(avgClose?.avg_days ?? 0)),
      diSavings: Number(di?.realized ?? 0),
      diPotential: Number(di?.potential ?? 0),
      // On-time delivery %: null when no closed STOs had both dates to measure.
      onTimePct: measured > 0 ? Math.round((onTimeCount / measured) * 100) : null,
      onTimeMeasured: measured,
      onTimeCount,
    });
  } catch (err) {
    logger.error({ err }, 'analytics/summary error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/analytics/by-status
router.get('/by-status', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { conds, params } = buildFilters(req.query as Record<string, string>);
    const rows = await dbQuery<{ status: string; cnt: number; total_value: number }>(
      `
      SELECT status, COUNT(*) AS cnt, COALESCE(SUM(material_value), 0) AS total_value
      FROM sto_requests ${toWhere(conds)} GROUP BY status
    `,
      params,
    );
    res.json(
      rows.map(r => ({ status: r.status, count: Number(r.cnt), value: Number(r.total_value) })),
    );
  } catch (err) {
    logger.error({ err }, 'analytics/by-status error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/analytics/by-month
router.get('/by-month', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const q = req.query as Record<string, string>;
    const { conds, params } = buildFilters(q);
    const allConds =
      q.dateFrom || q.dateTo
        ? conds
        : [
            ...conds,
            'request_date >= DATEADD(month, -11, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1))',
          ];
    const rows = await dbQuery<{ month: string; cnt: number; total_value: number }>(
      `
      SELECT FORMAT(request_date, 'yyyy-MM') AS month,
             COUNT(*) AS cnt, COALESCE(SUM(material_value), 0) AS total_value
      FROM sto_requests ${toWhere(allConds)}
      GROUP BY FORMAT(request_date, 'yyyy-MM')
      ORDER BY month
    `,
      params,
    );
    res.json(
      rows.map(r => ({ month: r.month, count: Number(r.cnt), value: Number(r.total_value) })),
    );
  } catch (err) {
    logger.error({ err }, 'analytics/by-month error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/analytics/by-site
router.get('/by-site', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { conds, params } = buildFilters(req.query as Record<string, string>);
    const [shipping, receiving] = await Promise.all([
      dbQuery<{ site: string; cnt: number; total_value: number }>(
        `
        SELECT TOP 10 shipping_site AS site, COUNT(*) AS cnt,
               COALESCE(SUM(material_value), 0) AS total_value
        FROM sto_requests ${toWhere([...conds, 'shipping_site IS NOT NULL'])}
        GROUP BY shipping_site ORDER BY cnt DESC
      `,
        params,
      ),
      dbQuery<{ site: string; cnt: number }>(
        `
        SELECT TOP 10 receiving_site AS site, COUNT(*) AS cnt
        FROM sto_requests ${toWhere([...conds, 'receiving_site IS NOT NULL'])}
        GROUP BY receiving_site ORDER BY cnt DESC
      `,
        params,
      ),
    ]);
    res.json({
      shipping: shipping.map(r => ({
        site: r.site,
        count: Number(r.cnt),
        value: Number(r.total_value),
      })),
      receiving: receiving.map(r => ({ site: r.site, count: Number(r.cnt) })),
    });
  } catch (err) {
    logger.error({ err }, 'analytics/by-site error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/analytics/site-flow
router.get('/site-flow', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { conds, params } = buildFilters(req.query as Record<string, string>);
    const rows = await dbQuery<{
      from_site: string;
      to_site: string;
      cnt: number;
      total_value: number;
    }>(
      `
      SELECT TOP 15 shipping_site AS from_site, receiving_site AS to_site,
             COUNT(*) AS cnt, COALESCE(SUM(material_value), 0) AS total_value
      FROM sto_requests ${toWhere([...conds, 'shipping_site IS NOT NULL', 'receiving_site IS NOT NULL'])}
      GROUP BY shipping_site, receiving_site ORDER BY cnt DESC
    `,
      params,
    );
    res.json(
      rows.map(r => ({
        from: r.from_site,
        to: r.to_site,
        count: Number(r.cnt),
        value: Number(r.total_value),
      })),
    );
  } catch (err) {
    logger.error({ err }, 'analytics/site-flow error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/analytics/rush-split
router.get('/rush-split', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const q = req.query as Record<string, string>;
    const { conds, params } = buildFilters({ ...q, rush: '' });
    const allConds =
      q.dateFrom || q.dateTo
        ? conds
        : [
            ...conds,
            'request_date >= DATEADD(month, -11, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1))',
          ];
    const rows = await dbQuery<{ month: string; rush: number; normal: number }>(
      `
      SELECT FORMAT(request_date, 'yyyy-MM') AS month,
             SUM(CASE WHEN rush_request = 1 THEN 1 ELSE 0 END) AS rush,
             SUM(CASE WHEN rush_request = 0 THEN 1 ELSE 0 END) AS normal
      FROM sto_requests ${toWhere(allConds)}
      GROUP BY FORMAT(request_date, 'yyyy-MM')
      ORDER BY month
    `,
      params,
    );
    res.json(rows.map(r => ({ month: r.month, rush: Number(r.rush), normal: Number(r.normal) })));
  } catch (err) {
    logger.error({ err }, 'analytics/rush-split error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/analytics/raw-data — paginated STO list for the detail table
router.get('/raw-data', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const q = req.query as Record<string, string>;
    const { conds, params } = buildFilters(q);
    const where = toWhere(conds);
    const page = Math.max(1, parseInt(q.page || '1'));
    const pageSize = 50;
    const offset = (page - 1) * pageSize;

    const [rows, countRow] = await Promise.all([
      dbQuery<Record<string, unknown>>(
        `
        SELECT id, sto_id, request_date, requestor_name, shipping_site, receiving_site,
               status, rush_request, material_description, material_sap, quantity, uom, material_value
        FROM sto_requests ${where}
        ORDER BY request_date DESC
        OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
      `,
        { ...params, offset, pageSize },
      ),
      dbQueryOne<{ total: number }>(`SELECT COUNT(*) AS total FROM sto_requests ${where}`, params),
    ]);

    res.json({
      rows: rows.map(r => ({
        ...r,
        rush_request: Boolean(r.rush_request),
        material_value: Number(r.material_value ?? 0),
        quantity: r.quantity != null ? Number(r.quantity) : null,
      })),
      total: Number(countRow?.total ?? 0),
      page,
      pageSize,
    });
  } catch (err) {
    logger.error({ err }, 'analytics/raw-data error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/analytics/cycle-time — average days spent in each workflow stage.
// Derived from the audit log: each transition's timestamp minus the previous
// transition's timestamp gives how long the STO sat in the previous stage.
router.get('/cycle-time', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { conds, params } = buildFilters(req.query as Record<string, string>);
    // Only include STOs the filters select. The audit log is joined so we can
    // measure real dwell time between status changes.
    const rows = await dbQuery<{ stage: string; avg_days: number; cnt: number }>(
      `
      WITH transitions AS (
        SELECT
          l.sto_request_id,
          l.new_status AS stage,
          l.performed_at AS entered_at,
          LEAD(l.performed_at) OVER (
            PARTITION BY l.sto_request_id ORDER BY l.performed_at
          ) AS left_at
        FROM sto_audit_log l
        JOIN sto_requests r ON r.id = l.sto_request_id
        ${toWhere(conds)}
        AND l.new_status IS NOT NULL
      )
      SELECT stage,
             AVG(CAST(DATEDIFF(hour, entered_at, left_at) AS FLOAT) / 24.0) AS avg_days,
             COUNT(*) AS cnt
      FROM transitions
      WHERE left_at IS NOT NULL
        AND stage IN ('PLANNING_REVIEW','SHIPPING_LOGISTICS','MANAGEMENT_REVIEW',
                      'RECEIVING_MGMT_REVIEW','RECEIVING_LOGISTICS')
      GROUP BY stage
    `,
      params,
    );
    res.json(
      rows.map(r => ({
        stage: r.stage,
        avgDays: Math.round(Number(r.avg_days) * 10) / 10,
        count: Number(r.cnt),
      })),
    );
  } catch (err) {
    logger.error({ err }, 'analytics/cycle-time error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/analytics/aging — active STOs stuck in their current stage, bucketed
// by how long since their last update. Returns bucket counts plus the oldest few.
router.get('/aging', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { conds, params } = buildFilters(req.query as Record<string, string>);
    const activeConds = [...conds, "status NOT IN ('CLOSED', 'REJECTED')"];
    const where = toWhere(activeConds);

    const [buckets, oldest] = await Promise.all([
      dbQueryOne<{ b0: number; b3: number; b7: number; b14: number }>(
        `
        SELECT
          SUM(CASE WHEN DATEDIFF(day, updated_at, GETDATE()) < 3 THEN 1 ELSE 0 END) AS b0,
          SUM(CASE WHEN DATEDIFF(day, updated_at, GETDATE()) BETWEEN 3 AND 6 THEN 1 ELSE 0 END) AS b3,
          SUM(CASE WHEN DATEDIFF(day, updated_at, GETDATE()) BETWEEN 7 AND 13 THEN 1 ELSE 0 END) AS b7,
          SUM(CASE WHEN DATEDIFF(day, updated_at, GETDATE()) >= 14 THEN 1 ELSE 0 END) AS b14
        FROM sto_requests ${where}
      `,
        params,
      ),
      dbQuery<Record<string, unknown>>(
        `
        SELECT TOP 10 id, sto_id, status, shipping_site, receiving_site,
               material_description, updated_at,
               DATEDIFF(day, updated_at, GETDATE()) AS days_in_stage
        FROM sto_requests ${where}
        ORDER BY updated_at ASC
      `,
        params,
      ),
    ]);

    res.json({
      buckets: {
        under3: Number(buckets?.b0 ?? 0),
        d3to6: Number(buckets?.b3 ?? 0),
        d7to13: Number(buckets?.b7 ?? 0),
        d14plus: Number(buckets?.b14 ?? 0),
      },
      oldest: oldest.map(r => ({ ...r, days_in_stage: Number(r.days_in_stage) })),
    });
  } catch (err) {
    logger.error({ err }, 'analytics/aging error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/analytics/rejections — rejection & revision counts by stage, from the
// audit log. Rejections are terminal; revisions send a request back to the
// requestor. Also returns the most recent rejected/revised STOs with reasons.
router.get('/rejections', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { conds, params } = buildFilters(req.query as Record<string, string>);
    const [byStage, recent] = await Promise.all([
      dbQuery<{ action: string; cnt: number }>(
        `
        SELECT l.action, COUNT(*) AS cnt
        FROM sto_audit_log l
        JOIN sto_requests r ON r.id = l.sto_request_id
        ${toWhere(conds)}
        AND l.action IN ('PLANNING_REJECTED','MANAGEMENT_REJECTED',
                         'RECEIVING_MGMT_REJECTED','PLANNING_REVISION_REQUESTED')
        GROUP BY l.action
      `,
        params,
      ),
      dbQuery<Record<string, unknown>>(
        `
        SELECT TOP 10 r.id, r.sto_id, l.action, l.notes, l.performed_by_name, l.performed_at
        FROM sto_audit_log l
        JOIN sto_requests r ON r.id = l.sto_request_id
        ${toWhere(conds)}
        AND l.action IN ('PLANNING_REJECTED','MANAGEMENT_REJECTED',
                         'RECEIVING_MGMT_REJECTED','PLANNING_REVISION_REQUESTED')
        ORDER BY l.performed_at DESC
      `,
        params,
      ),
    ]);
    const map = Object.fromEntries(byStage.map(r => [r.action, Number(r.cnt)]));
    res.json({
      byStage: {
        planningRejected: map['PLANNING_REJECTED'] ?? 0,
        managementRejected: map['MANAGEMENT_REJECTED'] ?? 0,
        receivingMgmtRejected: map['RECEIVING_MGMT_REJECTED'] ?? 0,
        planningRevised: map['PLANNING_REVISION_REQUESTED'] ?? 0,
      },
      recent,
    });
  } catch (err) {
    logger.error({ err }, 'analytics/rejections error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
