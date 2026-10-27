import cron from 'node-cron';
import { dbQuery, dbQueryOne } from '../db/connection';
import { sendGroupWeeklyDigest, sendAdminWeeklyDigest } from '../lib/notify';
import { ALL_GRANTS } from '../lib/ldap';
import { STAGE_OWNERS } from './staleReminders';
import logger from '../lib/logger';
import { Group, STOStatus } from '../types';

const REJECTION_ACTIONS: Record<Group, string | null> = {
  shipping_planning: 'PLANNING_REJECTED',
  shipping_logistics: null, // logistics has no reject step, only forward/approve
  management: 'MANAGEMENT_REJECTED',
  receiving_management: 'RECEIVING_MGMT_REJECTED',
  receiving_logistics: null,
  site: null,
  admin: null,
};

interface QueueRow {
  id: number;
  sto_id: string;
  material_description: string | null;
  material_value: number | null;
  rush_request: boolean;
  updated_at: string;
}

interface GroupDigestData {
  group: Group;
  site: string;
  queueCount: number;
  rushCount: number;
  agingCount: number; // 48h+ untouched, same threshold as the stale-reminder job
  queueValue: number;
  oldest: QueueRow[];
  movedCount: number; // left this stage (any outcome) in the last 7 days
  rejectedCount: number;
  valueMoved: number;
}

// One group+site's digest: everything currently sitting in their queue, plus
// what moved out of it (to anywhere, any outcome) in the last 7 days. Mirrors
// the stale-reminder job's status->owner mapping so "their queue" means the
// same thing in both places.
async function gatherGroupDigest(group: Group, site: string): Promise<GroupDigestData | null> {
  const ownedStatus = (Object.entries(STAGE_OWNERS) as [STOStatus, (typeof STAGE_OWNERS)[STOStatus]][]).find(
    ([, owner]) => owner?.group === group,
  );
  if (!ownedStatus) return null; // role has no queue of its own (e.g. 'site')
  const [status, owner] = ownedStatus;
  if (!owner) return null;
  const siteColumn = owner.siteColumn;

  const [queue, oldest, moved] = await Promise.all([
    dbQueryOne<{ cnt: number; rush_cnt: number; aging_cnt: number; total_value: number }>(
      `
      SELECT
        COUNT(*) AS cnt,
        SUM(CASE WHEN rush_request = 1 THEN 1 ELSE 0 END) AS rush_cnt,
        SUM(CASE WHEN DATEDIFF(hour, updated_at, GETDATE()) >= 48 THEN 1 ELSE 0 END) AS aging_cnt,
        COALESCE(SUM(material_value), 0) AS total_value
      FROM sto_requests
      WHERE archived = 0 AND status = @status AND ${siteColumn} = @site
    `,
      { status, site },
    ),
    dbQuery<QueueRow>(
      `
      SELECT TOP 5 id, sto_id, material_description, material_value, rush_request, updated_at
      FROM sto_requests
      WHERE archived = 0 AND status = @status AND ${siteColumn} = @site
      ORDER BY updated_at ASC
    `,
      { status, site },
    ),
    dbQueryOne<{ moved_cnt: number; rejected_cnt: number; value_moved: number }>(
      `
      SELECT
        COUNT(*) AS moved_cnt,
        SUM(CASE WHEN l.action = @rejectAction THEN 1 ELSE 0 END) AS rejected_cnt,
        COALESCE(SUM(r.material_value), 0) AS value_moved
      FROM sto_audit_log l
      JOIN sto_requests r ON r.id = l.sto_request_id
      WHERE l.old_status = @status
        AND r.${siteColumn} = @site
        AND l.performed_at >= DATEADD(day, -7, GETDATE())
    `,
      { status, site, rejectAction: REJECTION_ACTIONS[group] ?? '__none__' },
    ),
  ]);

  return {
    group,
    site,
    queueCount: Number(queue?.cnt ?? 0),
    rushCount: Number(queue?.rush_cnt ?? 0),
    agingCount: Number(queue?.aging_cnt ?? 0),
    queueValue: Number(queue?.total_value ?? 0),
    oldest,
    movedCount: Number(moved?.moved_cnt ?? 0),
    rejectedCount: Number(moved?.rejected_cnt ?? 0),
    valueMoved: Number(moved?.value_moved ?? 0),
  };
}

interface AdminBreakdownRow {
  site: string;
  status: string;
  cnt: number;
  aging_cnt: number;
}

async function gatherAdminDigest() {
  const [totals, breakdown, rejections, di] = await Promise.all([
    dbQueryOne<{ submitted: number; closed: number; rejected: number; total_value: number }>(
      `
      SELECT
        (SELECT COUNT(*) FROM sto_audit_log WHERE action = 'SUBMITTED' AND performed_at >= DATEADD(day, -7, GETDATE())) AS submitted,
        (SELECT COUNT(*) FROM sto_requests WHERE archived = 0 AND status = 'CLOSED' AND updated_at >= DATEADD(day, -7, GETDATE())) AS closed,
        (SELECT COUNT(*) FROM sto_requests WHERE archived = 0 AND status = 'REJECTED' AND updated_at >= DATEADD(day, -7, GETDATE())) AS rejected,
        (SELECT COALESCE(SUM(material_value), 0) FROM sto_requests WHERE archived = 0 AND request_date >= DATEADD(day, -7, GETDATE())) AS total_value
    `,
      {},
    ),
    // Active queue depth + aging, broken out by site and stage, so admins can
    // spot which site/group is the bottleneck — the one thing a per-group
    // digest can't show on its own.
    dbQuery<AdminBreakdownRow>(
      `
      SELECT
        COALESCE(shipping_site, receiving_site) AS site,
        status,
        COUNT(*) AS cnt,
        SUM(CASE WHEN DATEDIFF(hour, updated_at, GETDATE()) >= 48 THEN 1 ELSE 0 END) AS aging_cnt
      FROM sto_requests
      WHERE archived = 0 AND status NOT IN ('CLOSED', 'REJECTED', 'DRAFT')
      GROUP BY COALESCE(shipping_site, receiving_site), status
      ORDER BY cnt DESC, site, status
    `,
      {},
    ),
    dbQueryOne<{ cnt: number }>(
      `
      SELECT COUNT(*) AS cnt FROM sto_audit_log
      WHERE action IN ('PLANNING_REJECTED','MANAGEMENT_REJECTED','RECEIVING_MGMT_REJECTED','PLANNING_REVISION_REQUESTED')
        AND performed_at >= DATEADD(day, -7, GETDATE())
    `,
      {},
    ),
    dbQueryOne<{ realized: number }>(
      `
      SELECT COALESCE(SUM(di_value), 0) AS realized
      FROM sto_requests
      WHERE archived = 0 AND distressed_inventory = 1 AND status = 'CLOSED'
        AND updated_at >= DATEADD(day, -7, GETDATE())
    `,
      {},
    ),
  ]);

  return {
    submittedCount: Number(totals?.submitted ?? 0),
    closedCount: Number(totals?.closed ?? 0),
    rejectedCount: Number(totals?.rejected ?? 0),
    totalValue: Number(totals?.total_value ?? 0),
    rejectionsAndRevisions: Number(rejections?.cnt ?? 0),
    diSavings: Number(di?.realized ?? 0),
    breakdown: breakdown.map(r => ({
      site: r.site,
      status: r.status,
      count: Number(r.cnt),
      aging: Number(r.aging_cnt),
    })),
  };
}

export async function runWeeklyDigest(): Promise<void> {
  for (const { group, site } of ALL_GRANTS) {
    try {
      const data = await gatherGroupDigest(group, site);
      if (!data) continue; // no queue for this role (e.g. 'site')
      await sendGroupWeeklyDigest(data);
    } catch (err) {
      logger.error({ err, group, site }, 'weekly digest failed for group');
    }
  }

  try {
    const adminData = await gatherAdminDigest();
    await sendAdminWeeklyDigest(adminData);
  } catch (err) {
    logger.error({ err }, 'weekly digest failed for admin summary');
  }

  logger.info('weekly digest run complete');
}

// Runs Monday mornings at 08:00 server time, alongside the daily
// stale-reminder job's cadence.
export function startWeeklyDigestJob(): void {
  cron.schedule('0 8 * * 1', () => {
    runWeeklyDigest().catch(err => logger.error({ err }, 'unhandled error in weekly digest cron job'));
  });
  logger.info('weekly digest job scheduled (Mondays 08:00)');
}
