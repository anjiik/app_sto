# Management approval

*Role: Management*

Management sign-off protects high-value, cold-chain, and non-standard shipments. It
happens at **both** the shipping site and the receiving site.

## When it's required

Management review only appears when logistics submits an STO that meets one of the
[approval rules](../reference/approval-rules.md) (high value, high freight, high
freight-to-value ratio, cold-chain, or a non-standard INCO term). Routine shipments
skip both management steps entirely.

## Two approvals, in order

1. **Management Review** — **shipping-site** management approves or rejects.
2. **Receiving Mgmt Review** — **receiving-site** management approves or rejects.

Both appear in the management **"Awaiting your Management Approval"** queue. If you
cover both sites, you'll see both steps.

## Your choices

- **Approve** — records your sign-off and advances the STO. After the receiving-site
  approval, it returns to Shipping Logistics for the [confirm pass](shipping-logistics.md#the-confirm-pass).
- **Reject** — declines the STO (status **Rejected**) with your reason recorded.

!!! warning "Both are required"
    A management-flagged STO cannot ship until **both** shipping-site and
    receiving-site management have approved. If either rejects, it stops.
