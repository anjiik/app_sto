# Getting started

STO Management is a web app for creating, approving, and tracking Stock Transfer
Orders between sites. This guide walks through every step, organised by the role you
play.

## Signing in

Open the app in your browser at your organisation's STO address (served under
`/sto`). Sign in with your normal work credentials — access is granted through your
Active Directory group for your **site** and **role** (for example
`APP-ABC-STO_Management_Logistics`). If you can't sign in, see
[Troubleshooting](troubleshooting.md#requesting-access).

## Your role determines what you see

The app is role-aware: your dashboard, queues, and available actions all depend on
your role. You may hold **more than one role** or cover **more than one site**.
Creating a request needs no role at all — any signed-in user can. Beyond that, the
six roles are:

| Role | What you do |
|------|-------------|
| Shipping Planning (`shipping_planning`) | Review requests; add planning details; approve, revise, or reject. |
| Shipping Logistics (`shipping_logistics`) | Add freight & shipping details; route for management approval when required. |
| Shipping Management (`management`) | Approve flagged shipments at the **shipping** site. |
| Receiving Management (`receiving_management`) | Approve flagged shipments at the **receiving** site. |
| Receiving Logistics (`receiving_logistics`) | Confirm receipt and close out the delivery. |
| Admin (`admin`) | Fix mistakes (revert / send back), manage archiving, oversee all sites. |

See [Reference → Roles & access](../reference/roles.md) for how holding multiple
roles and sites works.

## Navigating the app

The top navigation bar is available on every page:

- **Dashboard** — your personal work queue and key numbers ([details](dashboard.md)).
- **STOs** — the searchable list of all requests with filters and CSV export
  ([details](finding-stos.md)).
- **Analytics** — charts and trends across all STOs ([details](analytics.md)).
- **App Info** — the user guide, access requests, and administrator contacts.

!!! tip
    Start every session on the **Dashboard**. It shows exactly what is waiting on
    you, so nothing sits idle.

## The STO lifecycle at a glance

Every STO moves through the same ordered path. Each hand-off is one role's
responsibility. Management approval is only inserted when a shipment is high-value,
cold-chain, or otherwise flagged.

```text
Draft → Planning Review → Shipping Logistics
      → Management Review* → Receiving Mgmt Review*
      → Receiving Logistics → Closed
```

\* Management steps are skipped automatically when approval is not required. For the
full status table and rules, see [Approval workflow](../reference/workflow.md) and
[Approval rules](../reference/approval-rules.md).
