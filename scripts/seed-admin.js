require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'info@programmoceuticals.com';
const ADMIN_PASSWORD = 'admin123';
const ADMIN_NAME = 'ProgrammoCeuticals Admin';

const run = async () => {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  await mongoose.connect(mongoUri);

  const existing = await User.findOne({ email: ADMIN_EMAIL });

  if (existing) {
    if (existing.role !== 'admin') {
      existing.role = 'admin';
      await existing.save();
      console.log('Existing user promoted to admin:', ADMIN_EMAIL);
    } else {
      console.log('Admin already exists:', ADMIN_EMAIL);
    }
    await mongoose.disconnect();
    return;
  }

  const password_hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await User.create({
    name: ADMIN_NAME,
    email: ADMIN_EMAIL,
    password_hash,
    role: 'admin',
  });

  console.log('Admin created:', ADMIN_EMAIL);
  await mongoose.disconnect();
};

run().catch(e => { console.error(e.message); process.exit(1); });
