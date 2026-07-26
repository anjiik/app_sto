# Admin tasks: revert, send back & archive

*Role: Admin*

Admins can correct workflow mistakes and manage long-term data retention. These
actions are available on the STO detail page and dashboard.

## Revert (step back)

Moves an STO **back one step** in the workflow — useful when something advanced by
mistake. It clears the current step's reason. You can click it repeatedly to step
back several stages.

## Send back (step back with a reason)

Like Revert, but requires a **mandatory note**. The note is attached to the STO so
the role receiving it knows exactly what to fix. Prefer Send Back over Revert
whenever the earlier role needs instructions.

!!! warning "Use sparingly"
    Revert and Send Back move an STO backward against the normal flow. Every use is
    logged in the audit trail. Always add a clear reason so the history stays
    understandable.

## Archiving

Closed or rejected STOs older than a retention window can be soft-archived to keep the
working set fast. From the dashboard, admins can **preview** how many records are
eligible and then **run** the archive. Archived records are hidden from normal lists
but not deleted.
