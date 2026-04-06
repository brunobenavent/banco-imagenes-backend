// src/server.js
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import config from './config/index.js';

// Import routes
import authRoutes from './routes/auth.js';
import imageRoutes from './routes/images.js';

const app = express();

// CORS configuration - allow requests from Netlify frontend
app.use(cors({
  origin: true, // Allow all origins in Vercel (serverless will handle this)
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root route for Vercel
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Banco Images API', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/images', imageRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'El archivo es demasiado grande. Máximo 10MB.' });
    }
    return res.status(400).json({ message: err.message });
  }
  
  res.status(500).json({ message: 'Error interno del servidor.' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Ruta no encontrada.' });
});

let serverInstance = null;

// Connect to MongoDB and start server
async function start() {
  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(config.mongodbUri);
      console.log('[Server] Conectado a MongoDB');
    }

    if (!serverInstance) {
      serverInstance = app.listen(config.port, () => {
        console.log(`[Server] Servidor ejecutándose en puerto ${config.port}`);
        console.log(`[Server] Entorno: ${config.nodeEnv}`);
      });
    }

    return serverInstance;

  } catch (error) {
    console.error('[Server] Error al iniciar:', error.message);
    return null;
  }
}

async function stop() {
  if (serverInstance) {
    await new Promise((resolve, reject) => {
      serverInstance.close((err) => {
        if (err) return reject(err);
        return resolve();
      });
    });
    serverInstance = null;
  }

  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
}

// Handle uncaught exceptions (log but don't crash)
process.on('uncaughtException', (err) => {
  console.error('[Server] Excepción no manejada:', err.message);
});

// Handle unhandled rejections (log but don't crash)
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Rechazo no manejado:', reason);
});

// For local development
if (import.meta.url === `file://${process.argv[1]}`) {
  start().catch((err) => {
    console.error('[Server] No se pudo iniciar:', err.message);
  });
}

// Vercel requires default export to be the app
export default app;

// Also export named functions for local development
export { start, stop };
