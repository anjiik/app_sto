import { dbExecute } from './connection';

export async function logAdminAction(
  action: string,
  targetUserId: number,
  targetUsername: string,
  performedBy: number,
  performedByName: string,
  oldValue?: string,
  newValue?: string,
): Promise<void> {
  await dbExecute(
    `INSERT INTO admin_audit_log
       (action, target_user_id, target_username, performed_by, performed_by_name, old_value, new_value)
     VALUES
       (@action, @targetUserId, @targetUsername, @performedBy, @performedByName, @oldValue, @newValue)`,
    {
      action,
      targetUserId,
      targetUsername,
      performedBy,
      performedByName,
      oldValue: oldValue ?? null,
      newValue: newValue ?? null,
    },
  );
}
