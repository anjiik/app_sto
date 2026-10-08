import cron from 'node-cron';
import { dbQuery, dbExecute } from '../db/connection';
import { sendStaleQueueReminder } from '../lib/notify';
import logger from '../lib/logger';
import { Group, STOStatus } from '../types';

const STALE_HOURS = 48;

// Mirrors frontend/src/pages/Dashboard.tsx's GROUP_QUEUE — which role owns
// each in-progress status, and whether that role acts on the shipping or
// receiving side (determines which site column to scope the AD group by).
const STAGE_OWNERS: Partial<Record<STOStatus, { group: Group; siteColumn: 'shipping_site' | 'receiving_site' }>> = {
  PLANNING_REVIEW: { group: 'shipping_planning', siteColumn: 'shipping_site' },
  SHIPPING_LOGISTICS: { group: 'shipping_logistics', siteColumn: 'shipping_site' },
  MANAGEMENT_REVIEW: { group: 'management', siteColumn: 'shipping_site' },
  RECEIVING_MGMT_REVIEW: { group: 'receiving_management', siteColumn: 'receiving_site' },
  RECEIVING_LOGISTICS: { group: 'receiving_logistics', siteColumn: 'receiving_site' },
};

interface StaleRow {
  id: number;
  sto_id: string;
  status: STOStatus;
  shipping_site: string | null;
  receiving_site: string | null;
  updated_at: string;
  last_stale_reminder_at: string | null;
}

// Finds every STO sitting in one of the owned stages that's been untouched
// 48h+ since it last changed (updated_at), and is due for a reminder. "Due"
// is one of three cases:
//   1. last_stale_reminder_at IS NULL           — never reminded in this stay
//   2. last_stale_reminder_at <= now-48h
//      AND last_stale_reminder_at > updated_at  — reminded before, in THIS
//                                                  stay, and 48h have passed
//                                                  since that reminder
//   3. last_stale_reminder_at <= updated_at     — the stored reminder
//                                                  timestamp is from a PRIOR
//                                                  stage (STO has since
//                                                  transitioned and is now
//                                                  stale again in a new one)
// Case 3 matters because last_stale_reminder_at is never explicitly cleared
// on a status transition (see migration 020) — updated_at moving past it is
// what signals "that old reminder doesn't count for the current stay",
// which both resets the 48h clock and avoids needing to touch every one of
// approvals.ts's status-changing UPDATEs just to null out this column.
async function findStaleSTOs(): Promise<StaleRow[]> {
  return dbQuery<StaleRow>(
    `
    SELECT id, sto_id, status, shipping_site, receiving_site, updated_at, last_stale_reminder_at
    FROM sto_requests
    WHERE archived = 0
      AND status IN (${Object.keys(STAGE_OWNERS).map(s => `'${s}'`).join(', ')})
      AND updated_at <= DATEADD(HOUR, -${STALE_HOURS}, GETDATE())
      AND (
        last_stale_reminder_at IS NULL
        OR (
          last_stale_reminder_at <= DATEADD(HOUR, -${STALE_HOURS}, GETDATE())
          AND last_stale_reminder_at > updated_at
        )
        OR last_stale_reminder_at <= updated_at
      )
    `,
  );
}

export async function runStaleReminderCheck(): Promise<void> {
  let rows: StaleRow[];
  try {
    rows = await findStaleSTOs();
  } catch (err) {
    logger.error({ err }, 'stale-reminder check failed to query STOs');
    return;
  }

  for (const row of rows) {
    const owner = STAGE_OWNERS[row.status];
    if (!owner) continue; // status not in STAGE_OWNERS's keys shouldn't happen given the query, but keep ts happy
    const site = owner.siteColumn === 'shipping_site' ? row.shipping_site : row.receiving_site;
    if (!site) continue;

    const hoursWaiting = Math.floor(
      (Date.now() - new Date(row.updated_at).getTime()) / 3_600_000,
    );

    try {
      await sendStaleQueueReminder({
        sto_id: row.sto_id,
        status: row.status,
        hours_waiting: hoursWaiting,
        group: owner.group,
        site,
      });
      await dbExecute('UPDATE sto_requests SET last_stale_reminder_at = GETDATE() WHERE id = @id', {
        id: row.id,
      });
    } catch (err) {
      logger.error({ err, sto_id: row.sto_id }, 'failed to send stale-queue reminder');
    }
  }

  if (rows.length > 0) {
    logger.info({ count: rows.length }, 'stale-queue reminder check sent notifications');
  }
}

// Runs once a day at 08:00 server time. A daily cadence combined with the
// 48h threshold/repeat window means an entry gets its first reminder
// somewhere in the 48-72h range (whenever the next 08:00 run after crossing
// the threshold happens to land), not at the exact 48h mark — acceptable for
// a reminder, and far simpler than a finer-grained scheduler.
export function startStaleReminderJob(): void {
  cron.schedule('0 8 * * *', () => {
    runStaleReminderCheck().catch(err =>
      logger.error({ err }, 'unhandled error in stale-reminder cron job'),
    );
  });
  logger.info('stale-queue reminder job scheduled (daily 08:00)');
}
