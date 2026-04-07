// src/server.js - Simplified for Vercel
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import config from './config/index.js';

// Import routes
import authRoutes from './routes/auth.js';
import imageRoutes from './routes/images.js';

const app = express();

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(config.mongodbUri);
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
  }
};

// CORS
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Root route
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Banco Images API Running' });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// API Routes - mounted without /api prefix for cleaner URLs
app.use('/api/auth', authRoutes);
app.use('/api/images', imageRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ message: 'Internal server error' });
});

// Start server only when running locally (not on Vercel)
if (process.env.VERCEL === undefined) {
  const PORT = process.env.PORT || 3000;
  connectDB().then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  });
}

export default app;
