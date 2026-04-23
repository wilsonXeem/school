const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const mongoUri =
  process.env.MONGODB_URI ||
  process.env.MONGO_URI ||
  'mongodb://localhost:27017/cohort-school';
const corsOriginRaw = String(process.env.CORS_ORIGIN || '*').trim();
const corsOrigins =
  corsOriginRaw === '*'
    ? '*'
    : corsOriginRaw
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

// Middleware
app.use(
  cors(
    corsOrigins === '*'
      ? {}
      : {
          origin: corsOrigins,
          credentials: true
        }
  )
);
app.use(express.json());

// Database connection
mongoose.connect(mongoUri)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Routes
app.use('/auth', require('./routes/auth'));
app.use('/courses', require('./routes/courses'));
app.use('/cohorts', require('./routes/cohorts'));
app.use('/admin', require('./routes/admin'));
app.use('/admin', require('./routes/adminLms'));
app.use('/student', require('./routes/student'));
app.use('/student', require('./routes/studentLms'));
app.use('/certificates', require('./routes/certificates'));
app.use('/execute', require('./routes/execute'));

// Health check
app.get('/', (req, res) => {
  res.json({ message: 'Cohort School API is running' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
