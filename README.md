# STO Management System

Stock Transfer Order management with role-based access and approval workflow.

## Setup

### 1. Database (SQL Server)
Run `backend/src/db/schema.sql` against your SQL Server database.

### 2. Backend
```bash
cd backend
cp .env.example .env
# Edit .env with your SQL Server connection details
npm install
npm run dev        # Runs on http://localhost:4000
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev        # Runs on http://localhost:5173
```

## Demo Login Credentials

| Username      | Password  | Role               |
|---------------|-----------|-------------------|
| admin         | admin123  | Administrator     |
| requestor1    | pass123   | Requestor (Plant A) |
| requestor2    | pass123   | Requestor (Plant B) |
| inventory1    | pass123   | Inventory Reviewer |
| manager1      | pass123   | Management        |
| finance1      | pass123   | Finance           |
| logistics1    | pass123   | Logistics         |

These are shown clickably on the login screen.

## Approval Workflow

```
DRAFT → SUBMITTED → INVENTORY_REVIEW
  → (if mgmt required) MANAGEMENT_REVIEW
  → FINANCE_REVIEW → APPROVED
  → SHIPPING → IN_TRANSIT → DELIVERED → CLOSED
                                      ↓
                                  REJECTED (any step)
```

Management approval triggers when:
- Material Value > $10,000
- Freight Cost > $5,000

## Migrating to Active Directory

In `backend/src/routes/auth.ts`, replace the `DEMO_USERS` array and password comparison with an LDAP/AD lookup.
The JWT payload shape (`userId`, `username`, `role`, `name`, `email`, `plant`) stays the same —
map your AD group names to the role strings: `requestor`, `inventory_reviewer`, `management`, `finance`, `logistics`, `admin`.
