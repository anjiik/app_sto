# Approval workflow

Every STO moves through the same ordered set of statuses. The two management steps
are inserted only when [management approval is required](approval-rules.md).

## Statuses

| Status | Meaning | Acted on by |
|--------|---------|-------------|
| `DRAFT` | Being written; not yet submitted | Requestor (any authenticated user) |
| `PLANNING_REVIEW` | Submitted; under feasibility review | `shipping_planning` |
| `SHIPPING_LOGISTICS` | Freight & shipping details being added | `shipping_logistics` |
| `MANAGEMENT_REVIEW` | Awaiting shipping-site management sign-off | `management` (shipping site) |
| `RECEIVING_MGMT_REVIEW` | Awaiting receiving-site management sign-off | `receiving_management` (receiving site) |
| `RECEIVING_LOGISTICS` | Shipped; awaiting receipt & closeout | `receiving_logistics` |
| `CLOSED` | Delivered and closed | — (terminal) |
| `REJECTED` | Declined at an approval step | — (terminal) |

## The flow

```text
DRAFT
  │  requestor submits
  ▼
PLANNING_REVIEW ── revise ─▶ DRAFT
  │  approve                 (back to requestor with a reason)
  │
  ▼
SHIPPING_LOGISTICS
  │
  ├─ management NOT required ──────────────────────────────┐
  │                                                        │
  └─ management required                                   │
       ▼                                                   │
     MANAGEMENT_REVIEW        (management, shipping site)  │
       ▼                                                   │
     RECEIVING_MGMT_REVIEW    (receiving_management)       │
       ▼                                                   │
     SHIPPING_LOGISTICS       (confirm pass)               │
       │                                                   │
       ▼                                                   ▼
     RECEIVING_LOGISTICS ◀──────────────────────────────────
       │  confirm receipt, then close out
       ▼
     CLOSED
```

Any approval step (planning, either management step) can instead end in `REJECTED`.
Planning can also **revise** a request back to `DRAFT` with a note explaining what to
fix.

## Notes on the flow

- **The confirm pass.** When management approval *was* required, the STO returns to
  `SHIPPING_LOGISTICS` one more time after both management approvals, so logistics can
  finalise shipment details before it advances to `RECEIVING_LOGISTICS`.
- **Both management steps are required together.** A management-flagged STO needs
  sign-off from *both* the shipping-site and receiving-site management before it can
  ship. If either rejects, it stops.
- **Closeout.** Receiving logistics can update receipt details without closing; the
  STO stays in `RECEIVING_LOGISTICS` until it is explicitly closed out, which moves it
  to `CLOSED`.

## Admin corrections

Admins can move an STO backward against the normal flow:

- **Revert** — step back one status (e.g. after something advanced by mistake).
- **Send back** — step back with a mandatory reason attached, so the receiving step
  knows what to fix.

Both are recorded in the audit trail.
