import dotenv from 'dotenv';
dotenv.config(); // must run before any route imports read process.env

import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth';
import stoRoutes from './routes/sto';
import approvalRoutes from './routes/approvals';
import analyticsRoutes from './routes/analytics';

const app = express();
const PORT = parseInt(process.env.PORT || '4000');

app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/sto', stoRoutes);
app.use('/api/sto', approvalRoutes);
app.use('/api/analytics', analyticsRoutes);

app.get('/api/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.listen(PORT, () => {
  console.log(`STO backend running on http://localhost:${PORT}`);
  console.log(`DB Server: ${process.env.DB_SERVER || '(not configured)'}`);
});
