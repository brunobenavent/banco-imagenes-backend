// src/models/User.js
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// Define the user roles
export const UserRole = {
  EMPLOYEE: 'employee',
  EDITOR: 'editor',
  ADMIN: 'admin'
};

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  password: {
    type: String,
    required: true,
    select: false // Don't include in queries by default
  },
  nombre: {
    type: String,
    required: true
  },
  foto: {
    type: String,
    default: null
  },
  role: {
    type: String,
    enum: Object.values(UserRole),
    default: UserRole.EMPLOYEE
  },
  isVerified: {
    type: Boolean,
    default: false,
    index: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  verificationToken: {
    type: String,
    default: null,
    select: false
  },
  verificationExpires: {
    type: Date,
    default: null,
    index: { expireAfterSeconds: 0 } // TTL index - auto-cleanup expired tokens
  },
  resetToken: {
    type: String,
    default: null,
    select: false
  },
  resetExpires: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

export const User = mongoose.model('User', userSchema);
