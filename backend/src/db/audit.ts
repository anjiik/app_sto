import { dbExecute, TxExecutor } from './connection';

export async function logAudit(
  stoId: number,
  action: string,
  oldStatus: string | null,
  newStatus: string,
  userName: string,
  notes?: string,
  execute: TxExecutor = dbExecute,
): Promise<void> {
  await execute(
    `INSERT INTO sto_audit_log
       (sto_request_id, action, old_status, new_status, performed_by_name, notes)
     VALUES
       (@stoId, @action, @oldStatus, @newStatus, @performedByName, @notes)`,
    {
      stoId,
      action,
      oldStatus: oldStatus ?? null,
      newStatus,
      performedByName: userName,
      notes: notes ?? null,
    },
  );
}
