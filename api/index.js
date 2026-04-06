// api/index.js - Vercel serverless handler
import express from 'express';
import cors from 'cors';

const app = express();

// CORS
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Import routes
import authRoutes from './src/routes/auth.js';
import imageRoutes from './src/routes/images.js';

// Root route
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Banco Images API Running' });
});

// Health check
app.get('/health', (req, res) => {
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
