const mongoose = require('mongoose');

const enrollmentSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  course_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    default: null
  },
  cohort_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cohort',
    default: null
  },
  access_type: {
    type: String,
    enum: ['cohort', 'self_paced'],
    default: 'cohort'
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'archived', 'dropped'],
    default: 'active'
  }
}, {
  timestamps: true
});

enrollmentSchema.index(
  { user_id: 1, cohort_id: 1 },
  {
    unique: true,
    partialFilterExpression: {
      cohort_id: { $type: 'objectId' }
    }
  }
);

enrollmentSchema.index(
  { user_id: 1, course_id: 1, access_type: 1 },
  {
    unique: true,
    partialFilterExpression: {
      course_id: { $type: 'objectId' },
      access_type: 'self_paced'
    }
  }
);

const announcementSchema = new mongoose.Schema({
  cohort_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cohort',
    required: true
  },
  message: {
    type: String,
    required: true
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: null
  }
});

const materialSchema = new mongoose.Schema({
  course_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  title: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['pdf', 'link'],
    required: true
  },
  url: {
    type: String,
    required: true
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: null
  }
});

module.exports = {
  Enrollment: mongoose.model('Enrollment', enrollmentSchema),
  Announcement: mongoose.model('Announcement', announcementSchema),
  Material: mongoose.model('Material', materialSchema)
};
