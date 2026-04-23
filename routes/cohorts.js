const express = require('express');
const mongoose = require('mongoose');
const Cohort = require('../models/Cohort');
const Course = require('../models/Course');
const CohortApplication = require('../models/CohortApplication');
const { Enrollment } = require('../models');
const { createNotification } = require('../lib/notifications');
const { auth, optionalAuth } = require('../middleware/auth');

const router = express.Router();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

const slugify = (value) =>
  String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

const toObjectIdOrNull = (value) => {
  const stringValue = String(value || '').trim();
  if (!stringValue) {
    return null;
  }
  if (!mongoose.Types.ObjectId.isValid(stringValue)) {
    return null;
  }
  return new mongoose.Types.ObjectId(stringValue);
};

const mapCohortApplication = (application) => ({
  id: application._id,
  type: application.application_type || 'cohort_training',
  status: application.status || 'new',
  paymentStatus: application.payment_status || 'pending',
  fullName: application.full_name,
  email: application.email,
  phone: application.phone || '',
  notes: application.notes || '',
  adminNotes: application.admin_notes || '',
  preferredStartDate: application.preferred_start_date || null,
  source: application.source || 'web',
  createdAt: application.createdAt,
  updatedAt: application.updatedAt,
  user: application.user_id
    ? {
        id: application.user_id._id,
        name: application.user_id.name,
        email: application.user_id.email
      }
    : null,
  course: application.course_id
    ? {
        id: application.course_id._id,
        slug: application.course_id.slug,
        title: application.course_id.title
      }
    : {
        id: null,
        slug: application.course_slug || '',
        title: application.course_title || ''
      },
  cohort: application.cohort_id
    ? {
        id: application.cohort_id._id,
        name: application.cohort_id.name
      }
    : {
        id: null,
        name: application.cohort_name || ''
      }
});

const resolveCourse = async ({ courseId, courseSlug, cohort }) => {
  if (cohort?.course_id?._id) {
    return cohort.course_id;
  }

  const courseObjectId = toObjectIdOrNull(courseId);
  if (courseObjectId) {
    const byId = await Course.findById(courseObjectId).select('_id slug title');
    if (byId) {
      return byId;
    }
  }

  const normalizedSlug = slugify(courseSlug);
  if (!normalizedSlug) {
    return null;
  }

  return Course.findOne({ slug: normalizedSlug }).select('_id slug title');
};

const mapUpcomingCohort = ({ cohort, enrollmentCount }) => ({
  id: cohort._id,
  _id: cohort._id,
  name: cohort.name,
  status: cohort.status,
  startDate: cohort.start_date,
  endDate: cohort.end_date,
  durationWeeks: cohort.duration_weeks || 12,
  maxStudents: cohort.max_students || 25,
  instructor: cohort.instructor,
  schedule: {
    daysPerWeek: cohort.schedule?.days_per_week || 0,
    hoursPerSession: cohort.schedule?.hours_per_session || 0,
    timeSlot: cohort.schedule?.time_slot || ''
  },
  enrollmentCount,
  availableSlots: Math.max(0, (cohort.max_students || 25) - enrollmentCount),
  course: cohort.course_id
    ? {
        id: cohort.course_id._id,
        title: cohort.course_id.title,
        slug: cohort.course_id.slug,
        level: cohort.course_id.level || '',
        category: cohort.course_id.category || '',
        color: cohort.course_id.color || '#0b5ed7',
        iconKey: cohort.course_id.icon_key || cohort.course_id.slug,
        durationWeeks: cohort.course_id.duration_weeks || 12
      }
    : null
});

// Get upcoming cohorts across all courses (public)
router.get('/upcoming', async (req, res) => {
  try {
    const cohorts = await Cohort.find({
      status: { $in: ['upcoming', 'active'] },
      start_date: { $gte: new Date() }
    })
      .populate(
        'course_id',
        'title slug level category color icon_key duration_weeks'
      )
      .sort({ start_date: 1 })
      .lean();

    const cohortsWithCounts = await Promise.all(
      cohorts.map(async (cohort) => {
        const enrollmentCount = await Enrollment.countDocuments({
          cohort_id: cohort._id,
          status: { $ne: 'dropped' }
        });
        return mapUpcomingCohort({ cohort, enrollmentCount });
      })
    );

    res.json({
      cohorts: cohortsWithCounts
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get cohorts for a specific course (public)
router.get('/course/:courseId', async (req, res) => {
  try {
    const cohorts = await Cohort.find({ 
      course_id: req.params.courseId,
      status: { $in: ['upcoming', 'active'] }
    })
    .populate('course_id', 'title')
    .sort({ start_date: 1 });
    
    // Add enrollment counts
    const cohortsWithCounts = await Promise.all(
      cohorts.map(async (cohort) => {
        const enrollmentCount = await Enrollment.countDocuments({ cohort_id: cohort._id });
        return {
          ...cohort.toObject(),
          enrollment_count: enrollmentCount,
          available_slots: cohort.max_students - enrollmentCount
        };
      })
    );
    
    res.json({ cohorts: cohortsWithCounts });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Submit paid cohort application (public with optional auth)
router.post('/applications', optionalAuth, async (req, res) => {
  try {
    const requestedType = String(
      req.body?.applicationType || req.body?.application_type || 'cohort_training'
    )
      .trim()
      .toLowerCase();
    const applicationType =
      requestedType === 'certification' ? 'certification' : 'cohort_training';

    const fullName = String(req.body?.fullName || req.user?.name || '').trim();
    const email = String(req.body?.email || req.user?.email || '')
      .trim()
      .toLowerCase();
    const phone = String(req.body?.phone || '').trim();
    const notes = String(req.body?.notes || '').trim();
    const source = String(req.body?.sourcePage || req.body?.source || 'web').trim();

    if (!fullName || !email) {
      return res.status(400).json({
        message: 'Full name and email are required.'
      });
    }

    if (!EMAIL_PATTERN.test(email)) {
      return res.status(400).json({
        message: 'Enter a valid email address.'
      });
    }

    let cohort = null;
    const cohortObjectId = toObjectIdOrNull(req.body?.cohortId || req.body?.cohort_id);
    if (cohortObjectId) {
      cohort = await Cohort.findById(cohortObjectId)
        .populate('course_id', '_id slug title')
        .select('_id name course_id');
      if (!cohort) {
        return res.status(404).json({
          message: 'Selected cohort was not found.'
        });
      }
    }

    const course = await resolveCourse({
      courseId: req.body?.courseId || req.body?.course_id,
      courseSlug: req.body?.courseSlug || req.body?.course_slug,
      cohort
    });

    if (!course) {
      return res.status(400).json({
        message: 'A valid course is required for this application.'
      });
    }

    const preferredStartDateRaw =
      req.body?.preferredStartDate || req.body?.preferred_start_date;
    let preferredStartDate = null;
    if (preferredStartDateRaw) {
      const parsedDate = new Date(preferredStartDateRaw);
      if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({
          message: 'preferredStartDate must be a valid date.'
        });
      }
      preferredStartDate = parsedDate;
    }

    const application = await CohortApplication.create({
      application_type: applicationType,
      user_id: req.user?._id || null,
      full_name: fullName,
      email,
      phone,
      course_id: course._id,
      course_slug: course.slug,
      course_title: course.title,
      cohort_id: cohort?._id || null,
      cohort_name: cohort?.name || '',
      preferred_start_date: preferredStartDate,
      notes,
      source: source || 'web',
      status: 'new',
      payment_status: 'pending'
    });

    const populated = await CohortApplication.findById(application._id)
      .populate('user_id', 'name email')
      .populate('course_id', 'title slug')
      .populate('cohort_id', 'name')
      .lean();

    if (req.user?._id) {
      await createNotification({
        userId: req.user._id,
        type: 'cohort_application',
        title: 'Cohort application received',
        message:
          'Your paid cohort application has been submitted. Admissions will contact you after review.',
        meta: {
          applicationId: application._id,
          courseSlug: course.slug
        }
      });
    }

    res.status(201).json({
      application: mapCohortApplication(populated)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Authenticated student can view their own applications
router.get('/applications/my', auth, async (req, res) => {
  try {
    const applications = await CohortApplication.find({ user_id: req.user._id })
      .populate('user_id', 'name email')
      .populate('course_id', 'title slug')
      .populate('cohort_id', 'name')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      applications: applications.map(mapCohortApplication)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Enroll in cohort (requires auth)
router.post('/:cohortId/enroll', auth, async (req, res) => {
  try {
    const cohortId = req.params.cohortId;
    const userId = req.user.id;
    
    // Check if cohort exists
    const cohort = await Cohort.findById(cohortId);
    if (!cohort) {
      return res.status(404).json({ message: 'Cohort not found' });
    }
    
    // Check if already enrolled
    const existingEnrollment = await Enrollment.findOne({ 
      user_id: userId, 
      cohort_id: cohortId 
    });
    
    if (existingEnrollment) {
      return res.status(400).json({ message: 'Already enrolled in this cohort' });
    }
    
    // Check if cohort is full
    const enrollmentCount = await Enrollment.countDocuments({ cohort_id: cohortId });
    if (enrollmentCount >= cohort.max_students) {
      return res.status(400).json({ message: 'Cohort is full' });
    }
    
    // Create enrollment
    const enrollment = new Enrollment({
      user_id: userId,
      cohort_id: cohortId
    });
    
    await enrollment.save();
    
    res.status(201).json({ 
      message: 'Successfully enrolled in cohort',
      enrollment 
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
