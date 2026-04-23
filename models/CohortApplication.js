const mongoose = require('mongoose');

const cohortApplicationSchema = new mongoose.Schema(
  {
    application_type: {
      type: String,
      enum: ['cohort_training', 'certification'],
      default: 'cohort_training'
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    full_name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    phone: {
      type: String,
      default: '',
      trim: true
    },
    course_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      default: null
    },
    course_slug: {
      type: String,
      default: '',
      trim: true
    },
    course_title: {
      type: String,
      default: '',
      trim: true
    },
    cohort_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cohort',
      default: null
    },
    cohort_name: {
      type: String,
      default: '',
      trim: true
    },
    preferred_start_date: {
      type: Date,
      default: null
    },
    notes: {
      type: String,
      default: '',
      trim: true,
      maxlength: 2000
    },
    source: {
      type: String,
      default: 'web',
      trim: true
    },
    status: {
      type: String,
      enum: ['new', 'contacted', 'admitted', 'closed'],
      default: 'new'
    },
    payment_status: {
      type: String,
      enum: ['pending', 'confirmed', 'waived'],
      default: 'pending'
    },
    admin_notes: {
      type: String,
      default: '',
      trim: true,
      maxlength: 2000
    }
  },
  {
    timestamps: true
  }
);

cohortApplicationSchema.index({ createdAt: -1 });
cohortApplicationSchema.index({ user_id: 1, createdAt: -1 });
cohortApplicationSchema.index({ email: 1, status: 1 });

module.exports = mongoose.model('CohortApplication', cohortApplicationSchema);
