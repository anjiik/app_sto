# User Guide

This guide is for everyone who raises or acts on STO requests. It walks through the
app the way you use it day to day.

!!! info "Also available in the app"
    A downloadable version of this guide is linked from the **App Info** page inside
    the application.

## Getting started

1. Open the app and sign in. Access is granted through your Active Directory group
   for your site and role. If you cannot sign in, see
   [Requesting access](#requesting-access).
2. Your **role** determines what you see — your dashboard queues and the actions
   available on each STO. You may hold [more than one role or site](../reference/roles.md).
3. Use the top navigation: **Dashboard** (your work queues), **STOs** (search &
   filter all requests), **Analytics**, and **App Info**.

## The workflow at a glance

An STO moves through planning, shipping logistics, optional management approval, and
receiving before it closes. For the full picture — every status, who acts at each
step, and how management approval is triggered — see the Reference:

- [Approval workflow](../reference/workflow.md)
- [Approval rules](../reference/approval-rules.md)

## By role

- **Requestor (`receiving_site`)** — create a request from **New STO**, fill in the
  material, quantity, sites, and dates, then submit. It moves to planning review.
- **Shipping Planning** — review requests in your queue; **approve** to send to
  logistics, **revise** to send back to the requestor with a note, or **reject**.
- **Shipping Logistics** — add freight and shipping details and submit. The app
  routes to management review if [any approval rule](../reference/approval-rules.md)
  is met, otherwise straight to receiving.
- **Management** — approve or reject shipments flagged for review, at both the
  shipping site and the receiving site.
- **Receiving Logistics** — record receipt and close out the delivery, which moves
  the STO to `CLOSED`.

## Dashboards & queues

The Dashboard shows one action-queue section per role you hold, scoped to that
role's site(s), plus key counts (rush, due soon, overdue). If you hold several
roles, you will see a section for each.

## Finding STOs

The **STOs** page lists everything you can see, with search and filters (status,
priority, site, requestor, need-by date, rush, active-only) and CSV export.

## Requesting access

Access is granted by Active Directory group membership for your site and role.
Request the appropriate group from your IT service desk, and see
[AD group mapping](../reference/ad-groups.md) for the naming.
