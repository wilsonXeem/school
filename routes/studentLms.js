const express = require('express');
const mongoose = require('mongoose');
const Course = require('../models/Course');
const LessonProgress = require('../models/LessonProgress');
const Assessment = require('../models/Assessment');
const Submission = require('../models/Submission');
const Certificate = require('../models/Certificate');
const Notification = require('../models/Notification');
const CohortApplication = require('../models/CohortApplication');
const { Enrollment, Material } = require('../models');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.use(auth);

const LEGACY_COHORT_ACCESS_FILTER = {
  $or: [{ access_type: 'cohort' }, { access_type: { $exists: false } }]
};

const normalizeId = (value) => {
  if (!value) {
    return null;
  }
  if (typeof value === 'object' && value._id) {
    return String(value._id);
  }
  return String(value);
};

const slugify = (value) =>
  String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

const toObjectIdOrNull = (value) => {
  const stringValue = String(value || '').trim();
  if (!stringValue || !mongoose.Types.ObjectId.isValid(stringValue)) {
    return null;
  }
  return new mongoose.Types.ObjectId(stringValue);
};

const mapAssessment = (assessment) => ({
  id: normalizeId(assessment._id),
  courseId: normalizeId(assessment.course_id),
  moduleId: normalizeId(assessment.module_id),
  lessonId: normalizeId(assessment.lesson_id),
  title: assessment.title,
  slug: assessment.slug,
  type: assessment.type || 'quiz',
  instructions: assessment.instructions || '',
  questions: Array.isArray(assessment.questions) ? assessment.questions : [],
  passScore: assessment.pass_score ?? 70,
  maxAttempts: assessment.max_attempts ?? 3,
  isPublished: Boolean(assessment.is_published),
  createdAt: assessment.createdAt,
  updatedAt: assessment.updatedAt
});

const mapSubmission = (submission) => ({
  id: normalizeId(submission._id),
  assessmentId: normalizeId(submission.assessment_id),
  userId: normalizeId(submission.user_id),
  answers: submission.answers ?? null,
  score: submission.score ?? null,
  status: submission.status || 'submitted',
  feedback: submission.feedback || '',
  attemptNumber: submission.attempt_number || 1,
  reviewedBy: normalizeId(submission.reviewed_by),
  submittedAt: submission.submitted_at || submission.createdAt,
  reviewedAt: submission.reviewed_at || null,
  createdAt: submission.createdAt,
  updatedAt: submission.updatedAt,
  assessment: submission.assessment_id && submission.assessment_id.title
    ? {
        id: normalizeId(submission.assessment_id),
        title: submission.assessment_id.title,
        slug: submission.assessment_id.slug,
        type: submission.assessment_id.type || 'quiz'
      }
    : null
});

const mapMaterial = (material) => ({
  id: normalizeId(material._id),
  courseId: normalizeId(material.course_id),
  title: material.title,
  type: material.type,
  url: material.url,
  createdAt: material.created_at || material.createdAt || null,
  updatedAt:
    material.updated_at ||
    material.updatedAt ||
    material.created_at ||
    material.createdAt ||
    null
});

const mapSelfPacedEnrollment = (enrollment) => ({
  id: normalizeId(enrollment._id),
  accessType: enrollment.access_type || 'self_paced',
  status: enrollment.status || 'active',
  createdAt: enrollment.createdAt,
  updatedAt: enrollment.updatedAt,
  course: enrollment.course_id
    ? {
        id: normalizeId(enrollment.course_id),
        title: enrollment.course_id.title,
        slug: enrollment.course_id.slug,
        description: enrollment.course_id.description || '',
        level: enrollment.course_id.level || '',
        category: enrollment.course_id.category || ''
      }
    : null
});

const mapCohortEnrollment = (enrollment) => ({
  id: normalizeId(enrollment._id),
  accessType: enrollment.access_type || 'cohort',
  status: enrollment.status || 'active',
  createdAt: enrollment.createdAt,
  updatedAt: enrollment.updatedAt,
  cohort: enrollment.cohort_id
    ? {
        id: normalizeId(enrollment.cohort_id),
        name: enrollment.cohort_id.name,
        status: enrollment.cohort_id.status,
        startDate: enrollment.cohort_id.start_date,
        endDate: enrollment.cohort_id.end_date,
        durationWeeks: enrollment.cohort_id.duration_weeks,
        instructor: enrollment.cohort_id.instructor,
        schedule: enrollment.cohort_id.schedule || {}
      }
    : null,
  course: enrollment.cohort_id?.course_id
    ? {
        id: normalizeId(enrollment.cohort_id.course_id),
        title: enrollment.cohort_id.course_id.title,
        slug: enrollment.cohort_id.course_id.slug,
        level: enrollment.cohort_id.course_id.level || '',
        category: enrollment.cohort_id.course_id.category || ''
      }
    : null
});

const mapLessonProgress = (entry) => ({
  id: normalizeId(entry._id),
  status: entry.status || 'in_progress',
  percentComplete: entry.percent_complete || 0,
  lastPosition: entry.last_position || {},
  startedAt: entry.started_at || entry.createdAt,
  completedAt: entry.completed_at || null,
  updatedAt: entry.updatedAt,
  lesson: entry.lesson_id
    ? {
        id: normalizeId(entry.lesson_id),
        title: entry.lesson_id.title,
        slug: entry.lesson_id.slug,
        moduleId: normalizeId(entry.lesson_id.module_id),
        courseId: normalizeId(entry.lesson_id.course_id)
      }
    : null,
  module: entry.module_id
    ? {
        id: normalizeId(entry.module_id),
        title: entry.module_id.title || ''
      }
    : null,
  course: entry.course_id
    ? {
        id: normalizeId(entry.course_id),
        title: entry.course_id.title || '',
        slug: entry.course_id.slug || ''
      }
    : null
});

const mapNotification = (notification) => ({
  id: normalizeId(notification._id),
  type: notification.type || 'system',
  title: notification.title,
  message: notification.message,
  isRead: Boolean(notification.is_read),
  readAt: notification.read_at || null,
  meta: notification.meta || {},
  createdAt: notification.createdAt,
  updatedAt: notification.updatedAt
});

const mapCertificate = (certificate) => ({
  id: normalizeId(certificate._id),
  certificateNumber: certificate.certificate_number,
  status: certificate.status || 'issued',
  issuedAt: certificate.issued_at || certificate.createdAt,
  course: certificate.course_id
    ? {
        id: normalizeId(certificate.course_id),
        title: certificate.course_id.title,
        slug: certificate.course_id.slug
      }
    : null,
  cohort: certificate.cohort_id
    ? {
        id: normalizeId(certificate.cohort_id),
        name: certificate.cohort_id.name
      }
    : null
});

const resolveCourse = async (courseInput) => {
  const courseId = toObjectIdOrNull(courseInput);
  if (courseId) {
    const byId = await Course.findById(courseId);
    if (byId) {
      return byId;
    }
  }

  const slug = slugify(courseInput);
  if (!slug) {
    return null;
  }

  return Course.findOne({ slug });
};

router.get('/courses/:courseSlug/assessments', async (req, res) => {
  try {
    const course = await Course.findOne({
      slug: req.params.courseSlug,
      is_published: true
    })
      .select('_id title slug')
      .lean();

    if (!course) {
      return res.status(404).json({ message: 'Course not found.' });
    }

    const assessments = await Assessment.find({
      course_id: course._id,
      is_published: true
    })
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      course: {
        id: normalizeId(course._id),
        title: course.title,
        slug: course.slug
      },
      assessments: assessments.map(mapAssessment)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/assessments/:assessmentId/submissions', async (req, res) => {
  try {
    const assessment = await Assessment.findById(req.params.assessmentId).lean();
    if (!assessment || !assessment.is_published) {
      return res.status(404).json({ message: 'Assessment not found.' });
    }

    const attemptCount = await Submission.countDocuments({
      assessment_id: assessment._id,
      user_id: req.user._id
    });

    if (attemptCount >= (assessment.max_attempts || 3)) {
      return res.status(400).json({
        message: 'Maximum submission attempts reached for this assessment.'
      });
    }

    const answers = hasOwn(req.body, 'answers') ? req.body.answers : null;

    const submission = await Submission.create({
      assessment_id: assessment._id,
      user_id: req.user._id,
      answers,
      status: 'submitted',
      attempt_number: attemptCount + 1,
      submitted_at: new Date()
    });

    res.status(201).json({
      submission: mapSubmission(submission)
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        message: 'A submission already exists for that attempt.',
        error: error.message
      });
    }

    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

router.get('/submissions', async (req, res) => {
  try {
    const filter = { user_id: req.user._id };

    const assessmentId = toObjectIdOrNull(req.query.assessmentId);
    if (assessmentId) {
      filter.assessment_id = assessmentId;
    } else if (req.query.courseSlug || req.query.courseId) {
      const course = await resolveCourse(req.query.courseSlug || req.query.courseId);
      if (!course) {
        return res.status(404).json({ message: 'Course not found.' });
      }
      const assessments = await Assessment.find({ course_id: course._id })
        .select('_id')
        .lean();
      const assessmentIds = assessments.map((entry) => entry._id);
      if (assessmentIds.length === 0) {
        return res.json({ submissions: [] });
      }
      filter.assessment_id = { $in: assessmentIds };
    }

    const submissions = await Submission.find(filter)
      .populate('assessment_id', 'title slug type')
      .sort({ submitted_at: -1, createdAt: -1 })
      .lean();

    res.json({
      submissions: submissions.map(mapSubmission)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/materials/course/:courseSlug', async (req, res) => {
  try {
    const course = await Course.findOne({
      slug: req.params.courseSlug,
      is_published: true
    })
      .select('_id title slug')
      .lean();

    if (!course) {
      return res.status(404).json({ message: 'Course not found.' });
    }

    const materials = await Material.find({ course_id: course._id })
      .sort({ created_at: -1 })
      .lean();

    res.json({
      course: {
        id: normalizeId(course._id),
        title: course.title,
        slug: course.slug
      },
      materials: materials.map(mapMaterial)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/dashboard-summary', async (req, res) => {
  try {
    const [
      selfPacedEnrollments,
      cohortEnrollments,
      lessonProgress,
      certificates,
      notifications,
      unreadNotifications,
      pendingApplications
    ] = await Promise.all([
      Enrollment.find({
        user_id: req.user._id,
        access_type: 'self_paced'
      })
        .populate('course_id', 'title slug description level category')
        .sort({ createdAt: -1 })
        .lean(),
      Enrollment.find({
        user_id: req.user._id,
        ...LEGACY_COHORT_ACCESS_FILTER
      })
        .populate({
          path: 'cohort_id',
          populate: {
            path: 'course_id',
            select: 'title slug level category'
          }
        })
        .sort({ createdAt: -1 })
        .lean(),
      LessonProgress.find({ user_id: req.user._id })
        .populate('course_id', 'title slug')
        .populate('module_id', 'title')
        .populate('lesson_id', 'title slug module_id course_id')
        .sort({ updatedAt: -1 })
        .limit(50)
        .lean(),
      Certificate.find({
        user_id: req.user._id,
        status: 'issued'
      })
        .populate('course_id', 'title slug')
        .populate('cohort_id', 'name')
        .sort({ issued_at: -1 })
        .limit(10)
        .lean(),
      Notification.find({ user_id: req.user._id })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      Notification.countDocuments({
        user_id: req.user._id,
        is_read: false
      }),
      CohortApplication.countDocuments({
        $or: [{ user_id: req.user._id }, { email: req.user.email }],
        status: { $in: ['new', 'contacted'] }
      })
    ]);

    const continueLearningEntry =
      lessonProgress.find((entry) => entry.status !== 'completed') ||
      lessonProgress[0] ||
      null;

    const completedLessons = lessonProgress.filter(
      (entry) => entry.status === 'completed'
    ).length;
    const inProgressLessons = lessonProgress.filter(
      (entry) => entry.status === 'in_progress'
    ).length;

    res.json({
      learner: {
        id: normalizeId(req.user._id),
        name: req.user.name,
        email: req.user.email,
        role: req.user.role
      },
      summary: {
        selfPacedEnrollments: selfPacedEnrollments.length,
        cohortEnrollments: cohortEnrollments.length,
        completedLessons,
        inProgressLessons,
        certificates: certificates.length,
        unreadNotifications,
        pendingApplications
      },
      continueLearning: continueLearningEntry
        ? {
            course: continueLearningEntry.course_id
              ? {
                  id: normalizeId(continueLearningEntry.course_id),
                  title: continueLearningEntry.course_id.title,
                  slug: continueLearningEntry.course_id.slug
                }
              : null,
            module: continueLearningEntry.module_id
              ? {
                  id: normalizeId(continueLearningEntry.module_id),
                  title: continueLearningEntry.module_id.title
                }
              : null,
            lesson: continueLearningEntry.lesson_id
              ? {
                  id: normalizeId(continueLearningEntry.lesson_id),
                  title: continueLearningEntry.lesson_id.title,
                  slug: continueLearningEntry.lesson_id.slug
                }
              : null,
            progress: mapLessonProgress(continueLearningEntry)
          }
        : null,
      enrollments: {
        selfPaced: selfPacedEnrollments.map(mapSelfPacedEnrollment),
        cohorts: cohortEnrollments.map(mapCohortEnrollment)
      },
      certificates: certificates.map(mapCertificate),
      notifications: notifications.map(mapNotification)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
