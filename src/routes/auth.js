// src/routes/auth.js
const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { User, UserRole } = require('../models/User');
const config = require('../config');
const { authenticate, authorize } = require('../middleware/auth');
const emailService = require('../services/email');

const RESET_TOKEN_EXPIRES = 60 * 60 * 1000; // 1 hour

const router = express.Router();

/**
 * Register new user
 * Only @viverosguzman.es emails allowed
 * Sends verification email instead of auto-login
 */
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, nombre } = req.body;
    
    // Validate required fields
    if (!email || !password || !nombre) {
      return res.status(400).json({ message: 'Email, password y nombre son requeridos.' });
    }
    
    // Check email domain
    const emailDomain = email.split('@')[1];
    if (emailDomain !== config.allowedEmailDomain) {
      return res.status(400).json({ 
        message: `Solo se permiten correos con dominio @${config.allowedEmailDomain}`
      });
    }
    
    // Check if user exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: 'El usuario ya existe.' });
    }
    
    // Generate verification token (64 hex chars = 32 bytes)
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    // Create user with verification fields (default role is employee)
    const user = new User({
      email: email.toLowerCase(),
      password,
      nombre,
      role: UserRole.EMPLOYEE,
      isVerified: false,
      verificationToken,
      verificationExpires
    });
    
    await user.save();
    
    // Send verification email (non-blocking - don't fail registration if email fails)
    try {
      await emailService.sendVerificationEmail(user.email, user.nombre, verificationToken);
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError.message);
      // Don't fail registration - log and continue
    }
    
    // Return success message - NO JWT token
    res.status(201).json({
      message: 'Revisa tu correo para verificar tu cuenta'
    });
    
  } catch (error) {
    next(error);
  }
});

/**
 * Verify email with token
 */
router.get('/verify/:token', async (req, res, next) => {
  try {
    const { token } = req.params;
    const email = req.query.email; // Optional: to check if already verified
    
    if (!token) {
      return res.status(400).json({ message: 'Token requerido.' });
    }
    
    // Find user with this verification token
    const user = await User.findOne({ 
      verificationToken: token,
      verificationExpires: { $gt: new Date() }
    }).select('+verificationToken');
    
    // Check if already verified (token was cleared)
    const alreadyVerified = await User.findOne({ 
      verificationToken: null,
      email: req.query.email // We'll pass this from frontend
    });
    
    // First check: token is valid
    if (user) {
      // Verify the user
      user.isVerified = true;
      user.verificationToken = null;
      user.verificationExpires = null;
      await user.save();
      
      return res.status(200).json({
        message: 'Email verificado exitosamente. Ya puedes iniciar sesión.'
      });
    }
    
    // Check if token was already used (user is already verified)
    const userByEmail = await User.findOne({ email: req.query.email });
    if (userByEmail && userByEmail.isVerified) {
      return res.status(200).json({
        message: 'Tu correo electrónico ya está verificado. Ya puedes iniciar sesión.'
      });
    }
    
    // Token is invalid or expired
    return res.status(400).json({ message: 'Token inválido o ha expirado. Por favor, contacta al administrador.' });
    
    // Verify the user
    user.isVerified = true;
    user.verificationToken = null;
    user.verificationExpires = null;
    await user.save();
    
    res.status(200).json({
      message: 'Email verificado exitosamente. Ya puedes iniciar sesión.'
    });
    
  } catch (error) {
    next(error);
  }
});

/**
 * Login user
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ message: 'Email y password son requeridos.' });
    }
    
    // Find user with password
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    
    if (!user) {
      return res.status(401).json({ message: 'Credenciales inválidas.' });
    }
    
    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Credenciales inválidas.' });
    }
    
    // Check if user is verified
    if (!user.isVerified) {
      return res.status(403).json({ message: 'Debes verificar tu correo electrónico antes de iniciar sesión' });
    }
    
    // Generate JWT
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );
    
    res.json({
      user: {
        id: user._id,
        email: user.email,
        nombre: user.nombre,
        foto: user.foto,
        role: user.role
      },
      token
    });
    
  } catch (error) {
    next(error);
  }
});

/**
 * Forgot password - send reset email
 */
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: 'Email es requerido.' });
    }
    
    const user = await User.findOne({ email: email.toLowerCase() });
    
    // Always return success to prevent email enumeration
    if (!user) {
      return res.status(200).json({ 
        message: 'Si el correo existe, recibirás un enlace para restablecer tu contraseña.' 
      });
    }
    
    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + RESET_TOKEN_EXPIRES);
    
    user.resetToken = resetToken;
    user.resetExpires = resetExpires;
    await user.save();
    
    // Send reset email
    try {
      await emailService.sendPasswordResetEmail(user.email, user.nombre, resetToken);
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError.message);
    }
    
    res.status(200).json({ 
      message: 'Si el correo existe, recibirás un enlace para restablecer tu contraseña.' 
    });
    
  } catch (error) {
    next(error);
  }
});

/**
 * Reset password with token
 */
router.post('/reset-password/:token', async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password } = req.body;
    
    if (!token) {
      return res.status(400).json({ message: 'Token requerido.' });
    }
    
    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres.' });
    }
    
    const user = await User.findOne({ 
      resetToken: token,
      resetExpires: { $gt: new Date() }
    });
    
    if (!user) {
      return res.status(400).json({ message: 'Token inválido o ha expirado.' });
    }
    
    // Update password and clear reset token
    user.password = password;
    user.resetToken = null;
    user.resetExpires = null;
    await user.save();
    
    res.status(200).json({ 
      message: 'Contraseña actualizada correctamente. Ya puedes iniciar sesión.' 
    });
    
  } catch (error) {
    next(error);
  }
});

/**
 * Get current user info
 */
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado.' });
    }
    
    res.json({
      user: {
        id: user._id,
        email: user.email,
        nombre: user.nombre,
        foto: user.foto,
        role: user.role,
        createdAt: user.createdAt
      }
    });
    
  } catch (error) {
    next(error);
  }
});

/**
 * Admin: List all users
 */
router.get('/users', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const users = await User.find().select('-password');
    res.json({ users });
  } catch (error) {
    next(error);
  }
});

/**
 * Admin: Update user role
 */
router.put('/users/:userId/role', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    
    // Prevent users from changing their own role
    if (userId.toString() === req.user.userId.toString()) {
      return res.status(400).json({ message: 'No puedes cambiar tu propio rol.' });
    }
    
    if (!Object.values(UserRole).includes(role)) {
      return res.status(400).json({ message: 'Rol inválido.' });
    }
    
    const user = await User.findByIdAndUpdate(
      userId,
      { role },
      { new: true }
    ).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado.' });
    }
    
    res.json({ message: 'Rol actualizado.', user });
    
  } catch (error) {
    next(error);
  }
});

/**
 * Admin: Delete user
 */
router.delete('/users/:userId', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { userId } = req.params;
    
    // Prevent self-deletion
    if (userId.toString() === req.user.userId.toString()) {
      return res.status(400).json({ message: 'No puedes eliminarte a ti mismo.' });
    }
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado.' });
    }
    
    // Prevent deleting admin users
    if (user.role === 'admin') {
      return res.status(400).json({ message: 'No puedes eliminar un usuario administrador.' });
    }
    
    await User.findByIdAndDelete(userId);
    
    res.json({ message: 'Usuario eliminado.' });
    
  } catch (error) {
    next(error);
  }
});

/**
 * Admin: Update user (name, active status)
 */
router.put('/users/:userId', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { nombre, isActive } = req.body;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado.' });
    }
    
    // Prevent users from modifying themselves (including superadmin)
    // Compare as strings to handle ObjectId comparison
    if (userId.toString() === req.user.userId.toString()) {
      return res.status(400).json({ message: 'No puedes modificar tu propia cuenta.' });
    }
    
    // Update fields if provided
    if (nombre !== undefined) {
      user.nombre = nombre;
    }
    if (isActive !== undefined) {
      user.isActive = isActive;
    }
    
    await user.save();
    
    res.json({ 
      message: 'Usuario actualizado.',
      user: {
        _id: user._id,
        email: user.email,
        nombre: user.nombre,
        role: user.role,
        isVerified: user.isVerified,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
    
  } catch (error) {
    next(error);
  }
});

/**
 * Verify admin password (for delete confirmation)
 */
router.post('/verify-password', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ message: 'Contraseña requerida.' });
    }
    
    const user = await User.findById(req.user.userId).select('+password');
    
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado.' });
    }
    
    const isMatch = await user.comparePassword(password);
    
    if (!isMatch) {
      return res.status(401).json({ message: 'Contraseña incorrecta.' });
    }
    
    res.status(200).json({ message: 'Contraseña verificada.' });
    
  } catch (error) {
    next(error);
  }
});

/**
 * Get current user profile (including foto)
 */
router.get('/profile', authenticate, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado.' });
    }
    
    res.json({
      user: {
        id: user._id,
        email: user.email,
        nombre: user.nombre,
        foto: user.foto,
        role: user.role,
        createdAt: user.createdAt
      }
    });
    
  } catch (error) {
    next(error);
  }
});

/**
 * Update current user profile (nombre, foto)
 */
router.put('/profile', authenticate, async (req, res, next) => {
  try {
    const { nombre, foto } = req.body;
    
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado.' });
    }
    
    // Update fields if provided
    if (nombre !== undefined) {
      user.nombre = nombre;
    }
    if (foto !== undefined) {
      user.foto = foto;
    }
    
    await user.save();
    
    res.json({ 
      message: 'Perfil actualizado.',
      user: {
        id: user._id,
        email: user.email,
        nombre: user.nombre,
        foto: user.foto,
        role: user.role
      }
    });
    
  } catch (error) {
    next(error);
  }
});

/**
 * Change current user password
 */
router.put('/profile/password', authenticate, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Contraseña actual y nueva contraseña son requeridas.' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'La nueva contraseña debe tener al menos 6 caracteres.' });
    }
    
    const user = await User.findById(req.user.userId).select('+password');
    
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado.' });
    }
    
    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ message: 'La contraseña actual es incorrecta.' });
    }
    
    // Update password (the pre-save hook will hash it)
    user.password = newPassword;
    await user.save();
    
    res.json({ message: 'Contraseña actualizada correctamente.' });
    
  } catch (error) {
    next(error);
  }
});

module.exports = router;
