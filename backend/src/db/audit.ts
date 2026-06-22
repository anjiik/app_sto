import { dbExecute, TxExecutor } from './connection';

export async function logAudit(
  stoId: number,
  action: string,
  oldStatus: string | null,
  newStatus: string,
  userId: number,
  userName: string,
  notes?: string,
  execute: TxExecutor = dbExecute,
): Promise<void> {
  await execute(
    `INSERT INTO sto_audit_log
       (sto_request_id, action, old_status, new_status, performed_by, performed_by_name, notes)
     VALUES
       (@stoId, @action, @oldStatus, @newStatus, @performedBy, @performedByName, @notes)`,
    {
      stoId,
      action,
      oldStatus: oldStatus ?? null,
      newStatus,
      performedBy: userId,
      performedByName: userName,
      notes: notes ?? null,
    },
  );
}
