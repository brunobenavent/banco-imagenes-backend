const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.mock('../services/email', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(true),
  verifyConnection: jest.fn().mockResolvedValue(true)
}));

const { sendVerificationEmail } = require('../services/email');

describe('Auth routes - email verification flow', () => {
  let app;
  let start;
  let stop;
  let mongoServer;
  let config;
  const { User, UserRole } = require('../models/User');
  const mongoose = require('mongoose');

  beforeAll(async () => {
    process.env.JWT_SECRET = 'testsecret';
    process.env.EMAIL_USER = 'mailer@test.com';
    process.env.EMAIL_PASS = 'password';
    process.env.EMAIL_HOST = 'smtp.gmail.com';
    process.env.EMAIL_PORT = '587';
    process.env.EMAIL_FROM = 'Viveros Guzmán <noreply@test.com>';
    process.env.FRONTEND_URL = 'http://localhost:5173';

    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    process.env.MONGODB_URI = uri;

    config = require('../config');
    config.mongodbUri = uri;

    ({ app, start, stop } = require('../server'));
    await start();
  });

  afterAll(async () => {
    await stop();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.db.dropDatabase();
    }
    jest.clearAllMocks();
  });

  test('register -> verify -> login flow succeeds', async () => {
    const registerResponse = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'nuevo@viverosguzman.es',
        password: 'Secreto123',
        nombre: 'Nuevo Usuario'
      })
      .expect(201);

    expect(registerResponse.body.message).toMatch(/Revisa tu correo/i);
    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);

    const storedUser = await User.findOne({ email: 'nuevo@viverosguzman.es' }).select('+verificationToken');
    expect(storedUser).not.toBeNull();
    expect(storedUser.isVerified).toBe(false);
    expect(storedUser.verificationToken).toBeTruthy();

    // Login should be blocked until verification
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'nuevo@viverosguzman.es', password: 'Secreto123' })
      .expect(403);

    // Verify email
    await request(app)
      .get(`/api/auth/verify/${storedUser.verificationToken}`)
      .expect(200);

    const verifiedUser = await User.findOne({ email: 'nuevo@viverosguzman.es' });
    expect(verifiedUser.isVerified).toBe(true);

    // Login succeeds after verification
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nuevo@viverosguzman.es', password: 'Secreto123' })
      .expect(200);

    expect(loginResponse.body.token).toBeDefined();
    expect(loginResponse.body.user.email).toBe('nuevo@viverosguzman.es');
  });

  test('self-deletion is blocked for admin user', async () => {
    const admin = new User({
      email: 'admin@viverosguzman.es',
      password: 'Admin123',
      nombre: 'Admin',
      role: UserRole.ADMIN,
      isVerified: true
    });
    await admin.save();

    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@viverosguzman.es', password: 'Admin123' })
      .expect(200);

    const token = loginResponse.body.token;

    await request(app)
      .delete(`/api/auth/users/${admin._id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });
});
