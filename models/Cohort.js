const mongoose = require('mongoose');

const cohortSchema = new mongoose.Schema({
  course_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  start_date: {
    type: Date,
    required: true
  },
  end_date: {
    type: Date,
    required: true
  },
  max_students: {
    type: Number,
    default: 25
  },
  duration_weeks: {
    type: Number,
    default: 12,
    min: 1,
    max: 52
  },
  enrolled_students: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  instructor: {
    type: String,
    required: true
  },
  schedule: {
    days_per_week: {
      type: Number,
      default: 3
    },
    hours_per_session: {
      type: Number,
      default: 2
    },
    time_slot: String
  },
  status: {
    type: String,
    enum: ['upcoming', 'active', 'completed'],
    default: 'upcoming'
  }
}, {
  timestamps: true
});

cohortSchema.virtual('available_slots').get(function() {
  return this.max_students - this.enrolled_students.length;
});

cohortSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Cohort', cohortSchema);
