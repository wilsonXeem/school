const mongoose = require('mongoose');

const certificateSchema = new mongoose.Schema(
  {
    certificate_number: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    enrollment_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Enrollment',
      required: true,
      unique: true
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    cohort_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cohort',
      required: true
    },
    course_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true
    },
    issued_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    status: {
      type: String,
      enum: ['issued', 'revoked'],
      default: 'issued'
    },
    issued_at: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

certificateSchema.index({ user_id: 1, course_id: 1 });

module.exports = mongoose.model('Certificate', certificateSchema);
