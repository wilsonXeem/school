const mongoose = require('mongoose');

const whiteboardNoteSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    lesson_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lesson',
      default: null
    },
    course_id: {
      type: String,
      default: '',
      trim: true
    },
    slide_index: {
      type: Number,
      default: null,
      min: 1
    },
    snapshot: {
      objects: {
        type: [mongoose.Schema.Types.Mixed],
        default: []
      },
      stageScale: {
        type: Number,
        default: 0.75
      },
      stagePosition: {
        x: {
          type: Number,
          default: 60
        },
        y: {
          type: Number,
          default: 40
        }
      }
    }
  },
  {
    timestamps: true
  }
);

whiteboardNoteSchema.index(
  {
    user_id: 1,
    course_id: 1,
    slide_index: 1
  },
  {
    unique: true,
    partialFilterExpression: {
      course_id: { $exists: true, $ne: '' },
      slide_index: { $type: 'number' }
    }
  }
);

whiteboardNoteSchema.index(
  {
    user_id: 1,
    lesson_id: 1
  },
  {
    unique: true,
    partialFilterExpression: {
      lesson_id: { $type: 'objectId' }
    }
  }
);

module.exports = mongoose.model('WhiteboardNote', whiteboardNoteSchema);
