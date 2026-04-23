const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema(
  {
    assessment_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assessment',
      required: true
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    answers: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    score: {
      type: Number,
      default: null
    },
    status: {
      type: String,
      enum: ['draft', 'submitted', 'graded', 'returned'],
      default: 'submitted'
    },
    feedback: {
      type: String,
      default: '',
      trim: true
    },
    attempt_number: {
      type: Number,
      default: 1,
      min: 1
    },
    reviewed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    submitted_at: {
      type: Date,
      default: Date.now
    },
    reviewed_at: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

submissionSchema.index(
  { assessment_id: 1, user_id: 1, attempt_number: 1 },
  { unique: true }
);
submissionSchema.index({ user_id: 1, createdAt: -1 });

module.exports = mongoose.model('Submission', submissionSchema);
