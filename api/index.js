// api/index.js - Vercel serverless handler
import express from 'express';
import cors from 'cors';
import config from '../src/config/index.js';
import authRoutes from '../src/routes/auth.js';
import imageRoutes from '../src/routes/images.js';

const app = express();

// CORS
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Root route
app.get('/api', (req, res) => {
  res.json({ status: 'ok', message: 'Banco Images API Running' });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/images', imageRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Not found' });
});

export default app;
