# STO Management Documentation

Documentation for the **Stock Transfer Order (STO) Management System** — a web
application for creating, approving, and tracking stock transfers between sites.

## What this app does

Users raise a request to move stock from one site to another. The request moves
through a fixed approval workflow — planning, shipping logistics, optional
management sign-off, and receiving — until the delivery is confirmed and closed.
Access is role-based, and a single person can hold several roles across several
sites at once.

## Where to start

<div class="grid cards" markdown>

-   :material-account: **User Guide**

    ---

    For everyone who raises or acts on STO requests — creating requests,
    approvals, dashboards, and closeout.

    [:octicons-arrow-right-24: Open the User Guide](user-guide/index.md)

-   :material-book-open-variant: **Reference**

    ---

    The factual core: roles and the multi-role model, the approval workflow and
    statuses, and the rules that trigger management approval.

    [:octicons-arrow-right-24: Open the Reference](reference/index.md)

-   :material-server: **Administration**

    ---

    Deploying and running the app — IIS, PM2, and Active Directory group setup.

    [:octicons-arrow-right-24: Open Administration](admin/index.md)

-   :material-code-braces: **Development**

    ---

    Architecture and a walkthrough of the codebase for developers.

    [:octicons-arrow-right-24: Open Development](development/index.md)

</div>

## At a glance

| | |
|---|---|
| **Frontend** | React 18 · TypeScript · Vite (served under `/sto/`) |
| **Backend** | Node.js ≥ 20 · Express · TypeScript · JWT |
| **Database** | SQL Server |
| **Auth** | Active Directory / LDAP (production) · demo-user table (local dev) |

!!! note "Editing these docs"
    These pages are built with [MkDocs](https://www.mkdocs.org/). Preview them
    locally with `pip install -r docs-requirements.txt` then `mkdocs serve`.
    See [Administration](admin/index.md) for how the built site is deployed.
