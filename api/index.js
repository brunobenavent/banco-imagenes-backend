// api/index.js - Vercel serverless handler
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import 'dotenv/config';

const app = express();

// Connect to MongoDB for Vercel
const connectDB = async () => {
  if (mongoose.connection.readyState === 0) {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log('Connected to MongoDB (Vercel)');
    } catch (error) {
      console.error('MongoDB connection error:', error.message);
    }
  }
};

// Run connectDB for each request in serverless
app.use(async (req, res, next) => {
  await connectDB();
  next();
});

// CORS - allow specific origins for Netlify frontend
app.use(cors({
  origin: ['https://banco-imagenes-front.netlify.app', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Import routes
import authRoutes from '../src/routes/auth.js';
import imageRoutes from '../src/routes/images.js';

// Root route
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Banco Images API Running' });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/images', imageRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ message: 'Internal Server Error', error: err.message });
});

export default app;
