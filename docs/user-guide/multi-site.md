# Multi-site & multi-role access

Many users cover more than one site, or hold more than one role. The app supports
this throughout — your queues, lists, and approvals span everything you're assigned
to.

- Your access is defined by your Active Directory groups, one per **site + role**
  (e.g. `APP-ABC-STO_Management_Logistics` and `APP-ABL-STO_Management_Logistics`).
- Dashboard queues automatically include work from **every** site and role you cover,
  shown as a separate section per role.
- On the STOs list, the shipping-site and receiving-site filters accept **multiple
  sites at once**.
- Shipping management (`management`) acts on the shipping-site approval step, and
  receiving management (`receiving_management`) on the receiving-site step, each at
  their assigned sites. To cover both sides, a user needs both roles.

## Holding several roles

You can hold different roles at the same or different sites — for example logistics at
ABC plus planning at ABL, or shipping and receiving logistics at the same site. Each
role's actions are available only at the site where you hold that role.

For the full model and examples, see
[Reference → Roles & access](../reference/roles.md).

!!! note
    If you should see a site's STOs but don't, you may be missing that site's AD
    group. Request it via the **App Info** page.
