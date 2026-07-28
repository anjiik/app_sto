# Management approval

*Roles: Shipping Management (`management`) and Receiving Management (`receiving_management`)*

Management sign-off protects high-value, cold-chain, controlled, and non-standard
shipments. It happens at **both** the shipping site and the receiving site, and each
side is a **separate role**.

## When it's required

Management review only appears when logistics submits an STO that meets one of the
[approval rules](../reference/approval-rules.md) (high value, high freight, high
freight-to-value ratio, cold-chain, controlled shipping, or a non-standard INCO term).
Routine shipments skip both management steps entirely.

## Two approvals, in order

1. **Management Review** — **shipping-site** management (`management` role) approves or rejects.
2. **Receiving Mgmt Review** — **receiving-site** management (`receiving_management` role) approves or rejects.

Each side sees its own dashboard queue (**"Awaiting your Shipping Management Approval"**
and **"Awaiting your Receiving Management Approval"**). Because they are distinct roles,
someone holding only one cannot act on the other side's step.

## Your choices

- **Approve** — records your sign-off and advances the STO. After the receiving-site
  approval, it returns to Shipping Logistics for the [confirm pass](shipping-logistics.md#the-confirm-pass).
- **Reject** — declines the STO (status **Rejected**) with your reason recorded.

!!! warning "Both are required"
    A management-flagged STO cannot ship until **both** shipping-site and
    receiving-site management have approved. If either rejects, it stops.
