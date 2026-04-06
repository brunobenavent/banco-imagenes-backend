// src/services/email.js
import nodemailer from 'nodemailer';
import config from '../config/index.js';

/**
 * Create nodemailer transporter using Gmail SMTP
 */
const createTransporter = () => {
  return nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.secure,
    auth: {
      user: config.email.user,
      pass: config.email.pass
    }
  });
};

/**
 * Send verification email
 * @param {string} email - Recipient email address
 * @param {string} nombre - Recipient name
 * @param {string} token - Verification token
 * @returns {Promise} - Email send result
 */
export const sendVerificationEmail = async (email, nombre, token) => {
  const transporter = createTransporter();
  
  const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify?token=${token}&email=${encodeURIComponent(email)}`;
  
  const mailOptions = {
    from: config.email.from,
    to: email,
    subject: 'Verifica tu correo electrónico - Viveros Guzmán',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #2d5a27 0%, #4a7c42 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">Viveros Guzmán</h1>
            <p style="color: #e8f5e9; margin: 10px 0 0 0;">Banco de Imágenes</p>
          </div>
          
          <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 12px 12px;">
            <h2 style="color: #2d5a27; margin-top: 0;">¡Hola ${nombre}!</h2>
            
            <p>Gracias por registrarte en el Banco de Imágenes de Viveros Guzmán.</p>
            
            <p>Para completar tu registro, por favor verifica tu correo electrónico haciendo clic en el siguiente botón:</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verificationUrl}" style="display: inline-block; background: #2d5a27; color: #fff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                Verificar mi correo
              </a>
            </div>
            
            <p style="color: #666; font-size: 14px;">
              El enlace de verificación expirará en 24 horas.
            </p>
            
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
            
            <p style="color: #999; font-size: 12px; margin: 0;">
              Si no creaste una cuenta, puedes ignorar este correo.
            </p>
          </div>
        </body>
      </html>
    `
  };

  return transporter.sendMail(mailOptions);
};

/**
 * Verify SMTP connection
 * @returns {Promise<boolean>}
 */
export const verifyConnection = async () => {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    return true;
  } catch (error) {
    console.error('Email connection error:', error.message);
    return false;
  }
};

/**
 * Send password reset email
 * @param {string} email - Recipient email address
 * @param {string} nombre - Recipient name
 * @param {string} token - Reset token
 * @returns {Promise} - Email send result
 */
export const sendPasswordResetEmail = async (email, nombre, token) => {
  const transporter = createTransporter();
  
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
  
  const mailOptions = {
    from: config.email.from,
    to: email,
    subject: 'Restablece tu contraseña - Viveros Guzmán',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #2d5a27 0%, #4a7c42 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">Viveros Guzmán</h1>
            <p style="color: #e8f5e9; margin: 10px 0 0 0;">Banco de Imágenes</p>
          </div>
          
          <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-radius: 0 0 12px 12px;">
            <h2 style="color: #2d5a27; margin-top: 0;">¡Hola ${nombre}!</h2>
            
            <p>Has solicitado restablecer tu contraseña. Haz clic en el siguiente botón para crear una nueva:</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="display: inline-block; background: #2d5a27; color: #fff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                Restablecer mi contraseña
              </a>
            </div>
            
            <p style="color: #666; font-size: 14px;">
              El enlace expirará en 1 hora.
            </p>
            
            <p style="color: #999; font-size: 12px;">
              Si no solicitaste este cambio, puedes ignorar este correo.
            </p>
          </div>
        </body>
      </html>
    `
  };

  return transporter.sendMail(mailOptions);
};