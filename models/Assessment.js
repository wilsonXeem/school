const mongoose = require('mongoose');

const assessmentSchema = new mongoose.Schema(
  {
    course_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true
    },
    module_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Module',
      default: null
    },
    lesson_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lesson',
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
    type: {
      type: String,
      enum: ['quiz', 'assignment'],
      default: 'quiz'
    },
    instructions: {
      type: String,
      default: '',
      trim: true
    },
    questions: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    },
    pass_score: {
      type: Number,
      default: 70,
      min: 0,
      max: 100
    },
    max_attempts: {
      type: Number,
      default: 3,
      min: 1
    },
    is_published: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

assessmentSchema.index({ course_id: 1, module_id: 1, lesson_id: 1 });
assessmentSchema.index({ course_id: 1, slug: 1 }, { unique: true });

module.exports = mongoose.model('Assessment', assessmentSchema);
