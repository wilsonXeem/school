const mongoose = require('mongoose');

const moduleSchema = new mongoose.Schema(
  {
    course_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true
    },
    source_module_id: {
      type: Number,
      default: null
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    slug: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      default: '',
      trim: true
    },
    order_index: {
      type: Number,
      required: true,
      min: 1
    },
    lesson_count: {
      type: Number,
      default: 0,
      min: 0
    },
    estimated_minutes: {
      type: Number,
      default: 0,
      min: 0
    },
    is_published: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

moduleSchema.index({ course_id: 1, order_index: 1 });
moduleSchema.index({ course_id: 1, slug: 1 }, { unique: true });

module.exports = mongoose.model('Module', moduleSchema);
