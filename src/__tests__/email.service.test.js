const mockSendMail = jest.fn().mockResolvedValue(true);
const mockVerify = jest.fn().mockResolvedValue(true);

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: mockSendMail,
    verify: mockVerify
  }))
}));

describe('Email Service', () => {
  let emailService;

  beforeAll(() => {
    process.env.EMAIL_USER = 'mailer@test.com';
    process.env.EMAIL_PASS = 'password';
    process.env.EMAIL_HOST = 'smtp.gmail.com';
    process.env.EMAIL_PORT = '587';
    process.env.EMAIL_FROM = 'Viveros Guzmán <noreply@test.com>';
    process.env.FRONTEND_URL = 'http://localhost:5173';
    jest.resetModules();
    emailService = require('../services/email');
  });

  beforeEach(() => {
    mockSendMail.mockClear();
    mockVerify.mockClear();
  });

  test('sendVerificationEmail sends email with expected fields', async () => {
    const token = 'abc123token';
    await emailService.sendVerificationEmail('user@test.com', 'Usuario Test', token);

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const mailOptions = mockSendMail.mock.calls[0][0];
    expect(mailOptions.to).toBe('user@test.com');
    expect(mailOptions.subject).toContain('Verifica tu correo');
    expect(mailOptions.html).toContain(token);
    expect(mailOptions.from).toBe('Viveros Guzmán <noreply@test.com>');
  });

  test('verifyConnection returns true when transporter.verify succeeds', async () => {
    const result = await emailService.verifyConnection();
    expect(result).toBe(true);
    expect(mockVerify).toHaveBeenCalledTimes(1);
  });
});
