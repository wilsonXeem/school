const mongoose = require('mongoose');

const progressSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  course_id: {
    type: String,
    required: true
  },
  last_slide_index: {
    type: Number,
    default: 1
  },
  completed_slides: {
    type: Number,
    default: 1
  },
  total_slides: {
    type: Number,
    default: 1
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
});

progressSchema.index({ user_id: 1, course_id: 1 }, { unique: true });

module.exports = mongoose.model('Progress', progressSchema);
