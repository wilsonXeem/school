const mongoose = require('mongoose');

const lessonSchema = new mongoose.Schema(
  {
    course_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true
    },
    module_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Module',
      required: true
    },
    source_slide_id: {
      type: Number,
      default: null
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
    lesson_type: {
      type: String,
      default: 'slide',
      trim: true
    },
    summary: {
      type: String,
      default: '',
      trim: true
    },
    order_index: {
      type: Number,
      required: true,
      min: 1
    },
    estimated_duration_minutes: {
      type: Number,
      default: 5,
      min: 1
    },
    slide_count: {
      type: Number,
      default: 1,
      min: 1
    },
    content: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
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

lessonSchema.index({ course_id: 1, module_id: 1, order_index: 1 });
lessonSchema.index({ module_id: 1, slug: 1 }, { unique: true });

module.exports = mongoose.model('Lesson', lessonSchema);
