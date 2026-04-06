// src/middleware/auth.js
import jwt from 'jsonwebtoken';
import config from '../config/index.js';

/**
 * JWT Payload interface
 * @typedef {Object} JwtPayload
 * @property {string} userId
 * @property {string} email
 * @property {string} role
 */

/**
 * Express request with user
 * @typedef {Object} AuthRequest
 * @property {JwtPayload} user
 */

/**
 * Authentication middleware - verifies JWT token
 */
export function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        message: 'Acceso denegado. No se proporcionó token.' 
      });
    }
    
    const token = authHeader.split(' ')[1];
    const jwtSecret = config.jwtSecret;
    
    if (!jwtSecret) {
      throw new Error('JWT_SECRET no está definido en el servidor.');
    }
    
    // Verify token
    const decoded = jwt.verify(token, jwtSecret);
    req.user = decoded;
    next();
    
  } catch (error) {
    console.error('[Auth Error]', error.message);
    
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ message: 'Token expirado.' });
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ message: 'Token inválido.' });
    }
    return res.status(500).json({ message: 'Error interno de autenticación.' });
  }
}

/**
 * Role authorization middleware factory
 * @param {string[]} allowedRoles - Array of allowed roles
 */
export function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'No autenticado.' });
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: 'Acceso denegado. No tienes permisos suficientes.',
        requiredRole: allowedRoles,
        yourRole: req.user.role
      });
    }
    
    next();
  };
}

/**
 * Optional authentication - tries to verify token if present
 */
export function tryAuthenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }
    
    const token = authHeader.split(' ')[1];
    const jwtSecret = config.jwtSecret;
    
    if (!jwtSecret) {
      console.warn('[Auth Opcional] JWT_SECRET no definido. Omitiendo.');
      return next();
    }
    
    const decoded = jwt.verify(token, jwtSecret);
    req.user = decoded;
    next();
    
  } catch (error) {
    // Treat invalid token as anonymous
    console.warn('[Auth Opcional] Token inválido. Tratando como anónimo.');
    next();
  }
}
