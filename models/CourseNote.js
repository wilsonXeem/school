const mongoose = require('mongoose');

const courseNoteSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    course_slug: {
      type: String,
      required: true,
      trim: true
    },
    content: {
      type: String,
      default: ''
    }
  },
  { timestamps: true }
);

courseNoteSchema.index({ user_id: 1, course_slug: 1 }, { unique: true });

module.exports = mongoose.model('CourseNote', courseNoteSchema);
