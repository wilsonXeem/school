const mongoose = require('mongoose');

const lessonProgressSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
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
    lesson_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lesson',
      required: true
    },
    status: {
      type: String,
      enum: ['not_started', 'in_progress', 'completed'],
      default: 'in_progress'
    },
    percent_complete: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    last_position: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    started_at: {
      type: Date,
      default: Date.now
    },
    completed_at: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

lessonProgressSchema.index({ user_id: 1, lesson_id: 1 }, { unique: true });
lessonProgressSchema.index({ user_id: 1, course_id: 1, updatedAt: -1 });

module.exports = mongoose.model('LessonProgress', lessonProgressSchema);
