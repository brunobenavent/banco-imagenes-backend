// src/server.js
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const config = require('./config');

// Import routes
const authRoutes = require('./routes/auth');
const imageRoutes = require('./routes/images');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
    throw error;
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

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('[Server] Excepción no manejada:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Rechazo no manejado:', reason);
  process.exit(1);
});

if (require.main === module) {
  start().catch((err) => {
    console.error('[Server] No se pudo iniciar:', err.message);
    process.exit(1);
  });
}

module.exports = {
  app,
  start,
  stop
};
