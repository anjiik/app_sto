# Troubleshooting & FAQ

## Requesting access

Access is granted by Active Directory group membership for your **site** and **role**
(e.g. `ABC_PLANNING`). Use the **Requesting Access** link on the **App Info** page and
include the site(s) and role you need. For help, contact an administrator (listed on
the same page) or your IT service desk.

## Status quick reference

| Status | Owner | Next step |
|--------|-------|-----------|
| Draft | Requestor | Submit → Planning Review |
| Planning Review | Shipping Planning | Approve → Shipping Logistics |
| Shipping Logistics | Shipping Logistics | Submit → Management or Receiving Logistics |
| Management Review | Management (shipping) | Approve → Receiving Mgmt Review |
| Receiving Mgmt Review | Management (receiving) | Approve → Shipping Logistics (confirm) |
| Receiving Logistics | Receiving Logistics | Close out → Closed |
| Closed / Rejected | — | Terminal |

## Common questions

### I submitted an STO but can't edit it anymore.

Once submitted, an STO is read-only to the requestor. Ask Planning to *revise* it back
to Draft, or an admin to *send it back*.

### My STO went to management approval — why?

It met one of the [approval rules](../reference/approval-rules.md): high material
value, high freight cost, a high freight-to-value ratio, cold-chain shipping
conditions, or a non-standard INCO term.

### The estimated ship date isn't what I expected.

It's calculated from priority (15 / 30 / 45 days) and shifts to Monday if it lands on
a weekend — see [Creating a request](creating-a-request.md#how-the-estimated-ship-date-is-calculated).

### I can't see STOs for one of my sites.

You're probably missing that site's AD group. Request it via App Info.

### An STO was closed by mistake.

Contact an admin — reopening a closed STO requires the revert / send-back tools.
