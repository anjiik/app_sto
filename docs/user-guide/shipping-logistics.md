# Shipping logistics

*Role: Shipping Logistics*

Logistics adds the shipping and freight details, then submits. The app decides
whether management approval is needed and routes accordingly.

## Your queue

The **"Awaiting your Logistics Submission"** queue holds STOs at **Shipping
Logistics** for your site.

## What you add

- **Freight cost** and shipping details.
- STO number, shipment ID, and tracking information as they become available.

If the SAP STO# isn't available yet, click **Request STO#** — it flags a reminder on
the record for the requestor rather than blocking your submission. Filling in the
STO# later clears the reminder automatically.

## What happens when you submit

The app checks the [approval rules](../reference/approval-rules.md). If **any** is
met, the STO is routed to **Management Review**; otherwise it goes straight to
**Receiving Logistics**.

The rules, in brief:

- Material value over the configured threshold (default $100,000)
- Freight cost over the configured threshold (default $20,000)
- Freight-to-value ratio over 30%
- Cold-chain shipping conditions (Cold 2–8 °C, Cold below 0, Frozen)
- A non-standard INCO term (anything other than FCA or DAP)
- Controlled shipping is required

!!! note
    The dollar thresholds are configured by your administrators and may differ at
    your organisation. The behaviour is always the same: high value / high freight /
    high ratio / cold-chain / controlled shipping / non-standard INCO → management
    approval.

## The confirm pass

When management approval *was* required, the STO comes back to you one more time
after both management approvals. On this pass you finalise the shipment — **actual
ship date, estimated delivery date, PGI date, ready-to-ship** — and it then advances
to **Receiving Logistics**. It will not loop back to management again.
