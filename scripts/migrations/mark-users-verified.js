#!/usr/bin/env node

/**
 * Script: mark-users-verified.js
 * --------------------------------------
 * Marks all existing users as verified. Use this AFTER deploying
 * the email verification feature so legacy accounts keep access.
 *
 * Usage:
 *   node scripts/migrations/mark-users-verified.js
 */

require('dotenv').config();

const mongoose = require('mongoose');
const config = require('../../src/config');
const { User } = require('../../src/models/User');

async function run() {
  try {
    console.log('[Migration] Connecting to MongoDB...');
    await mongoose.connect(config.mongodbUri);
    console.log('[Migration] Connected.');

    const result = await User.updateMany(
      { isVerified: { $ne: true } },
      {
        isVerified: true,
        verificationToken: null,
        verificationExpires: null
      }
    );

    console.log('[Migration] Users marked as verified:', result.modifiedCount);
  } catch (error) {
    console.error('[Migration] Error:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
    console.log('[Migration] Connection closed.');
  }
}

run();
