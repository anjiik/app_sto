# Creating & submitting a request

Requestors (and admins) create new STOs. From the **STOs** list or the Dashboard,
click **New STO** to open the form.

## Filling in the form

Fields are grouped into sections. Required fields are validated before you can
submit.

### Requestor & material

| Field | Notes |
|-------|-------|
| Requestor name / email / requesting plant | Who the request is for. |
| Material (SAP) *(required)* | Exactly **8 digits**. |
| Material description *(required)* | Plain-language description. |
| Quantity & UoM *(required)* | Positive whole number and unit of measure. |
| Brand at receiving site *(required)* | Brand as it will be labelled at destination. |
| MPN / Batch / Expiration | Left blank here — **filled in by Planning**. |

### Shipping details

| Field | Notes |
|-------|-------|
| Shipping site & receiving site *(required)* | Where it ships from and to. |
| Shipping conditions *(required)* | Ambient, Cold 2–8 °C, Cold below 0, Frozen, or *Other* (free text). Cold-chain choices trigger management approval later. |
| Controlled shipping | Check if controlled; add notes if needed. |
| INCO terms | **FCA** or **DAP** are standard; choosing *Other* flags the STO for management approval. |

### Dates & urgency

| Field | Notes |
|-------|-------|
| Priority *(required)* | Priority 1, 2, or 3 — sets the standard estimated ship date automatically. |
| Rush request | Check to flag as rush. A **rush reason is then required**. |
| Standard estimated ship date | Auto-calculated (see below). Editable on rush. |
| Receiving site need-by date | Optional but recommended — drives "due soon" and "overdue" flags on dashboards. |

### Financial

| Field | Notes |
|-------|-------|
| Material value *(required)* | Value of the goods. High values trigger management approval. |

## How the estimated ship date is calculated

When you pick a priority, the app sets a **standard estimated ship date** from today:

- **Priority 1** → today + 15 days
- **Priority 2** → today + 30 days
- **Priority 3** → today + 45 days

!!! note "Weekend shift"
    If that date lands on a **Saturday or Sunday, it moves to the following Monday**
    automatically. The form shows a small note when this happens so the date isn't a
    surprise.

## Submitting

**Save** creates or updates a **Draft** — drafts are private to you and fully
editable. When ready, click **Submit**. The STO advances to **Planning Review** and
appears in the Planning team's queue. You'll be told what's missing if any required
field is blank.

!!! warning "Before you submit"
    Double-check the SAP number (8 digits), quantity, sites, and — if urgent — the
    rush reason. After submission you can't edit directly; you'd need Planning to
    revise it or an admin to send it back.

See [Approval rules](../reference/approval-rules.md) for exactly what makes an STO
require management approval.
