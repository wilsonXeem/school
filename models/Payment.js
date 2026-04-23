const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    application_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CohortApplication',
      default: null
    },
    enrollment_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Enrollment',
      default: null
    },
    type: {
      type: String,
      enum: ['cohort_training', 'certification'],
      required: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    currency: {
      type: String,
      default: 'NGN',
      trim: true,
      uppercase: true
    },
    reference: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    method: {
      type: String,
      enum: ['bank_transfer', 'card', 'cash', 'other'],
      default: 'bank_transfer'
    },
    provider: {
      type: String,
      enum: ['manual', 'paystack'],
      default: 'manual'
    },
    provider_status: {
      type: String,
      default: ''
    },
    authorization_url: {
      type: String,
      default: ''
    },
    access_code: {
      type: String,
      default: ''
    },
    failure_reason: {
      type: String,
      default: '',
      trim: true
    },
    gateway_response: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    paid_at: {
      type: Date,
      default: null
    },
    verified_at: {
      type: Date,
      default: null
    },
    status: {
      type: String,
      enum: [
        'initiated',
        'pending_review',
        'confirmed',
        'failed',
        'refunded'
      ],
      default: 'initiated'
    },
    proof_reference: {
      type: String,
      default: '',
      trim: true
    },
    proof_note: {
      type: String,
      default: '',
      trim: true,
      maxlength: 2000
    },
    proof_submitted_at: {
      type: Date,
      default: null
    },
    confirmed_at: {
      type: Date,
      default: null
    },
    confirmed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    admin_notes: {
      type: String,
      default: '',
      trim: true,
      maxlength: 2000
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

paymentSchema.index({ user_id: 1, createdAt: -1 });
paymentSchema.index({ application_id: 1, createdAt: -1 });
paymentSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Payment', paymentSchema);
