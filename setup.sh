#!/bin/bash
# Run this from the sto-management/ folder after installing Node.js

set -e

echo "=== Installing backend dependencies ==="
cd backend
cp .env.example .env
echo "⚠  Edit backend/.env with your SQL Server details before starting the backend"
npm install

echo ""
echo "=== Installing frontend dependencies ==="
cd ../frontend
npm install

echo ""
echo "=== Setup complete ==="
echo ""
echo "To start (in two terminals):"
echo "  Terminal 1: cd backend && npm run dev"
echo "  Terminal 2: cd frontend && npm run dev"
echo ""
echo "Then open: http://localhost:5173"
echo "Login with any demo account (shown on the login page)"
