const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: ['basic', 'programming', 'Basic Skills', 'Programming Languages'],
    required: true
  },
  level: {
    type: String,
    enum: ['Beginner', 'Intermediate', 'Advanced'],
    default: 'Beginner'
  },
  description: {
    type: String,
    required: true
  },
  slug: {
    type: String,
    required: true,
    unique: true
  },
  duration_weeks: {
    type: Number,
    default: 12
  },
  objectives: {
    type: [String],
    default: []
  },
  outline: {
    type: [String],
    default: []
  },
  color: {
    type: String,
    default: '#0b5ed7'
  },
  icon_key: {
    type: String,
    default: ''
  },
  preview_percent: {
    type: Number,
    min: 1,
    max: 100,
    default: 20
  },
  sort_order: {
    type: Number,
    default: 100
  },
  is_published: {
    type: Boolean,
    default: true
  },
  price: {
    type: Number,
    default: 0
  },
  created_at: {
    type: Date,
    default: Date.now
  }
});

courseSchema.pre('save', function(next) {
  if (!this.slug && this.title) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }
  if (!this.icon_key) {
    this.icon_key = this.slug;
  }
  this.preview_percent = Math.min(100, Math.max(1, this.preview_percent || 20));
  this.duration_weeks = Math.min(
    52,
    Math.max(1, Number(this.duration_weeks) || 12)
  );
  next();
});

module.exports = mongoose.model('Course', courseSchema);
