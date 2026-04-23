const mongoose = require('mongoose');

const timetableSchema = new mongoose.Schema({
  days: [{
    type: String,
    enum: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  }],
  start_time: {
    type: String,
    required: true
  },
  end_time: {
    type: String,
    required: true
  },
  timezone: {
    type: String,
    default: 'Africa/Lagos'
  }
});

module.exports = mongoose.model('Timetable', timetableSchema);