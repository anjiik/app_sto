# Approval rules

When shipping logistics submits an STO, the system decides whether it needs
**management approval**. If any rule below is met, the STO routes to
`MANAGEMENT_REVIEW` (and then `RECEIVING_MGMT_REVIEW`); otherwise it goes straight
to `RECEIVING_LOGISTICS`.

## When management approval is required

| Rule | Threshold |
|------|-----------|
| Material value is high | greater than **$100,000** |
| Freight cost is high | greater than **$20,000** |
| Freight is large relative to value | freight ÷ value greater than **30%** |
| Cold-chain shipping conditions | Cold 2–8 °C, Cold below 0, or Frozen |
| Non-standard INCO term | anything other than **FCA** or **DAP** |

If none apply, both management steps are skipped.

## Configurable vs fixed

- The two **dollar thresholds** are environment-configurable via
  `MANAGEMENT_APPROVAL_MATERIAL_THRESHOLD` and `MANAGEMENT_APPROVAL_FREIGHT_THRESHOLD`.
  When unset, they default to **$100,000** and **$20,000**.
- The **freight-to-value ratio (30%)**, the **cold-chain** conditions, and the
  **INCO-term** rule are fixed in the application.

## INCO terms

The request form offers **FCA** and **DAP** as the standard terms, plus **Other**
(free text) for anything else. Choosing a non-standard term flags the STO for
management approval.

- A **blank** INCO term does **not** trigger approval (the field is optional).
- Matching is case-insensitive.

!!! note "Dead configuration"
    An `sto_config` table exists in the schema with older threshold values, but it is
    **not read by the application** — the thresholds above (env var or default) are
    what actually apply. The table is a candidate for removal.
