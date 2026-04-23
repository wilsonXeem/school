const express = require('express');
const Course = require('../models/Course');
const Cohort = require('../models/Cohort');
const User = require('../models/User');
const Certificate = require('../models/Certificate');
const CohortApplication = require('../models/CohortApplication');
const Payment = require('../models/Payment');
const { Enrollment, Announcement, Material } = require('../models');
const { createNotification } = require('../lib/notifications');
const { auth, adminAuth } = require('../middleware/auth');

const router = express.Router();

router.use(auth);
router.use(adminAuth);

const COURSE_LEVELS = new Set(['Beginner', 'Intermediate', 'Advanced']);
const COHORT_STATUSES = new Set(['upcoming', 'active', 'completed']);
const ENROLLMENT_STATUSES = new Set(['active', 'completed', 'dropped']);
const APPLICATION_STATUSES = new Set(['new', 'contacted', 'admitted', 'closed']);
const PAYMENT_STATUSES = new Set(['pending', 'confirmed', 'waived']);
const PAYMENT_RECORD_STATUSES = new Set([
  'initiated',
  'pending_review',
  'confirmed',
  'failed',
  'refunded'
]);

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);

const slugify = (value) =>
  String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

const normalizeCategory = (category) => {
  const value = String(category || '').toLowerCase().trim();
  if (value === 'basic' || value === 'basic skills') {
    return 'basic';
  }
  return 'programming';
};

const parseListField = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

const clampNumber = ({ value, fallback, min, max }) => {
  const next = Number(value);
  if (Number.isNaN(next)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, next));
};

const normalizeCoursePayload = (body = {}, isPatch = false) => {
  const payload = {};

  if (!isPatch || hasOwn(body, 'title')) {
    payload.title = String(body.title || '').trim();
  }

  if (!isPatch || hasOwn(body, 'slug')) {
    const derivedSlug = String(body.slug || '').trim() || slugify(body.title || '');
    payload.slug = derivedSlug;
  }

  if (!isPatch || hasOwn(body, 'category')) {
    payload.category = normalizeCategory(body.category);
  }

  if (!isPatch || hasOwn(body, 'level')) {
    const level = String(body.level || 'Beginner').trim();
    payload.level = COURSE_LEVELS.has(level) ? level : 'Beginner';
  }

  if (!isPatch || hasOwn(body, 'description')) {
    payload.description = String(body.description || '').trim();
  }

  if (
    !isPatch ||
    hasOwn(body, 'durationWeeks') ||
    hasOwn(body, 'duration_weeks')
  ) {
    payload.duration_weeks = clampNumber({
      value: body.durationWeeks ?? body.duration_weeks,
      fallback: 12,
      min: 1,
      max: 52
    });
  }

  if (!isPatch || hasOwn(body, 'color')) {
    payload.color = String(body.color || '#0b5ed7').trim() || '#0b5ed7';
  }

  if (!isPatch || hasOwn(body, 'iconKey') || hasOwn(body, 'icon_key')) {
    payload.icon_key = String(body.iconKey || body.icon_key || '').trim();
  }

  if (
    !isPatch ||
    hasOwn(body, 'previewPercent') ||
    hasOwn(body, 'preview_percent')
  ) {
    payload.preview_percent = clampNumber({
      value: body.previewPercent ?? body.preview_percent,
      fallback: 20,
      min: 1,
      max: 100
    });
  }

  if (!isPatch || hasOwn(body, 'sortOrder') || hasOwn(body, 'sort_order')) {
    payload.sort_order = clampNumber({
      value: body.sortOrder ?? body.sort_order,
      fallback: 100,
      min: 1,
      max: 10000
    });
  }

  if (!isPatch || hasOwn(body, 'objectives')) {
    payload.objectives = parseListField(body.objectives);
  }

  if (!isPatch || hasOwn(body, 'outline')) {
    payload.outline = parseListField(body.outline);
  }

  if (!isPatch || hasOwn(body, 'isPublished') || hasOwn(body, 'is_published')) {
    if (typeof body.isPublished === 'boolean') {
      payload.is_published = body.isPublished;
    } else if (typeof body.is_published === 'boolean') {
      payload.is_published = body.is_published;
    } else if (!isPatch) {
      payload.is_published = true;
    }
  }

  return payload;
};

const mapEnrollment = (enrollment) => ({
  _id: enrollment._id,
  status: enrollment.status || 'active',
  createdAt: enrollment.createdAt,
  user: enrollment.user_id
    ? {
        _id: enrollment.user_id._id,
        id: enrollment.user_id._id,
        name: enrollment.user_id.name,
        email: enrollment.user_id.email
      }
    : null
});

const mapCohortWithEnrollments = (cohort, enrollments = []) => {
  const activeCount = enrollments.filter(
    (item) => (item.status || 'active') !== 'dropped'
  ).length;

  return {
    ...cohort,
    enrollment_count: activeCount,
    available_slots: Math.max(0, (cohort.max_students || 25) - activeCount),
    enrollments: enrollments.map(mapEnrollment),
    enrolled_students: enrollments
      .map((item) => item.user_id)
      .filter(Boolean)
      .map((student) => ({
        _id: student._id,
        id: student._id,
        name: student.name,
        email: student.email
      }))
  };
};

const mapCertificate = (certificate) => ({
  _id: certificate._id,
  certificateNumber: certificate.certificate_number,
  status: certificate.status || 'issued',
  issuedAt: certificate.issued_at || certificate.createdAt,
  enrollmentId: certificate.enrollment_id?._id || certificate.enrollment_id,
  student: certificate.user_id
    ? {
        _id: certificate.user_id._id,
        id: certificate.user_id._id,
        name: certificate.user_id.name,
        email: certificate.user_id.email
      }
    : null,
  cohort: certificate.cohort_id
    ? {
        _id: certificate.cohort_id._id,
        id: certificate.cohort_id._id,
        name: certificate.cohort_id.name
      }
    : null,
  course: certificate.course_id
    ? {
        _id: certificate.course_id._id,
        id: certificate.course_id._id,
        title: certificate.course_id.title,
        slug: certificate.course_id.slug
      }
    : null
});

const mapCohortApplication = (application) => ({
  _id: application._id,
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
        _id: application.user_id._id,
        id: application.user_id._id,
        name: application.user_id.name,
        email: application.user_id.email
      }
    : null,
  course: application.course_id
    ? {
        _id: application.course_id._id,
        id: application.course_id._id,
        title: application.course_id.title,
        slug: application.course_id.slug
      }
    : {
        _id: null,
        id: null,
        title: application.course_title || '',
        slug: application.course_slug || ''
      },
  cohort: application.cohort_id
    ? {
        _id: application.cohort_id._id,
        id: application.cohort_id._id,
        name: application.cohort_id.name
      }
    : {
        _id: null,
        id: null,
        name: application.cohort_name || ''
      }
});

const mapPayment = (payment) => ({
  _id: payment._id,
  id: payment._id,
  type: payment.type,
  amount: payment.amount,
  currency: payment.currency || 'NGN',
  reference: payment.reference,
  status: payment.status || 'initiated',
  method: payment.method || 'bank_transfer',
  provider: payment.provider || 'manual',
  providerStatus: payment.provider_status || '',
  authorizationUrl: payment.authorization_url || '',
  accessCode: payment.access_code || '',
  failureReason: payment.failure_reason || '',
  paidAt: payment.paid_at || null,
  verifiedAt: payment.verified_at || null,
  proofReference: payment.proof_reference || '',
  proofNote: payment.proof_note || '',
  proofSubmittedAt: payment.proof_submitted_at || null,
  adminNotes: payment.admin_notes || '',
  confirmedAt: payment.confirmed_at || null,
  createdAt: payment.createdAt,
  updatedAt: payment.updatedAt,
  user: payment.user_id
    ? {
        _id: payment.user_id._id,
        id: payment.user_id._id,
        name: payment.user_id.name,
        email: payment.user_id.email
      }
    : null,
  application: payment.application_id
    ? {
        _id: payment.application_id._id,
        id: payment.application_id._id,
        status: payment.application_id.status || 'new',
        paymentStatus: payment.application_id.payment_status || 'pending',
        courseTitle: payment.application_id.course_title || '',
        courseSlug: payment.application_id.course_slug || '',
        cohortName: payment.application_id.cohort_name || ''
      }
    : null,
  confirmedBy: payment.confirmed_by
    ? {
        _id: payment.confirmed_by._id,
        id: payment.confirmed_by._id,
        name: payment.confirmed_by.name,
        email: payment.confirmed_by.email
      }
    : null
});

const createCertificateNumber = () => {
  const now = new Date();
  const year = now.getFullYear();
  const token = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PC-${year}-${Date.now().toString().slice(-6)}-${token}`;
};

const generateUniqueCertificateNumber = async () => {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = createCertificateNumber();
    const existing = await Certificate.findOne({
      certificate_number: candidate
    })
      .select('_id')
      .lean();
    if (!existing) {
      return candidate;
    }
  }
  return `PC-${Date.now()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
};

const createCohortPayload = (body = {}, existing = null) => {
  const courseId = String(body.courseId || body.course_id || existing?.course_id || '').trim();
  const name = String(body.name || existing?.name || '').trim();
  const startDateRaw = body.startDate || body.start_date || existing?.start_date;
  const startDate = startDateRaw ? new Date(startDateRaw) : null;
  const durationWeeks = clampNumber({
    value: body.durationWeeks ?? body.duration_weeks ?? existing?.duration_weeks ?? 12,
    fallback: 12,
    min: 1,
    max: 52
  });
  const maxStudents = clampNumber({
    value: body.maxStudents ?? body.max_students ?? existing?.max_students ?? 25,
    fallback: 25,
    min: 1,
    max: 500
  });
  const instructor = String(
    body.instructor || existing?.instructor || 'ProgrammoCeuticals Faculty'
  ).trim();
  const daysPerWeek = clampNumber({
    value:
      body.daysPerWeek ??
      body.schedule?.days_per_week ??
      existing?.schedule?.days_per_week ??
      3,
    fallback: 3,
    min: 1,
    max: 7
  });
  const hoursPerSession = clampNumber({
    value:
      body.hoursPerSession ??
      body.schedule?.hours_per_session ??
      existing?.schedule?.hours_per_session ??
      2,
    fallback: 2,
    min: 1,
    max: 12
  });
  const startTime = String(body.start_time || '').trim();
  const endTime = String(body.end_time || '').trim();
  const fallbackTimeSlot = startTime && endTime ? `${startTime} - ${endTime}` : '';
  const timeSlot = String(
    body.timeSlot || body.schedule?.time_slot || fallbackTimeSlot || existing?.schedule?.time_slot || '6:00 PM WAT'
  ).trim();
  const statusCandidate = String(body.status || existing?.status || 'upcoming').trim();
  const status = COHORT_STATUSES.has(statusCandidate) ? statusCandidate : 'upcoming';

  if (!courseId || !name || !startDate || Number.isNaN(startDate.getTime())) {
    return null;
  }

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + durationWeeks * 7);

  return {
    course_id: courseId,
    name,
    start_date: startDate,
    end_date: endDate,
    duration_weeks: durationWeeks,
    max_students: maxStudents,
    instructor,
    schedule: {
      days_per_week: daysPerWeek,
      hours_per_session: hoursPerSession,
      time_slot: timeSlot
    },
    status
  };
};

router.get('/overview', async (req, res) => {
  try {
    const [
      totalStudents,
      totalCourses,
      publishedCourses,
      upcomingCohorts,
      activeCohorts,
      completedCohorts,
      totalEnrollments,
      openCohortApplications,
      pendingPaymentReviews
    ] = await Promise.all([
      User.countDocuments({ role: 'student' }),
      Course.countDocuments(),
      Course.countDocuments({ is_published: true }),
      Cohort.countDocuments({ status: 'upcoming' }),
      Cohort.countDocuments({ status: 'active' }),
      Cohort.countDocuments({ status: 'completed' }),
      Enrollment.countDocuments(),
      CohortApplication.countDocuments({ status: { $in: ['new', 'contacted'] } }),
      Payment.countDocuments({ status: 'pending_review' })
    ]);

    res.json({
      overview: {
        totalStudents,
        totalCourses,
        publishedCourses,
        cohorts: {
          upcoming: upcomingCohorts,
          active: activeCohorts,
          completed: completedCohorts
        },
        totalEnrollments,
        cohortApplications: {
          open: openCohortApplications
        },
        payments: {
          pendingReview: pendingPaymentReviews
        }
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/students', async (req, res) => {
  try {
    const [students, enrollmentStats] = await Promise.all([
      User.find({ role: 'student' })
        .select('_id name email interested_courses created_at')
        .sort({ created_at: -1 })
        .lean(),
      Enrollment.aggregate([
        {
          $group: {
            _id: '$user_id',
            total: { $sum: 1 },
            active: {
              $sum: {
                $cond: [{ $eq: ['$status', 'active'] }, 1, 0]
              }
            },
            completed: {
              $sum: {
                $cond: [{ $eq: ['$status', 'completed'] }, 1, 0]
              }
            }
          }
        }
      ])
    ]);

    const statsMap = new Map(
      enrollmentStats.map((stat) => [String(stat._id), stat])
    );

    res.json({
      students: students.map((student) => {
        const stat = statsMap.get(String(student._id));
        return {
          _id: student._id,
          id: student._id,
          name: student.name,
          email: student.email,
          interestedCourses: student.interested_courses || [],
          createdAt: student.created_at,
          enrollments: {
            total: stat?.total || 0,
            active: stat?.active || 0,
            completed: stat?.completed || 0
          }
        };
      })
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/courses', async (req, res) => {
  try {
    const courses = await Course.find().sort({ sort_order: 1, created_at: -1 });
    res.json({ courses });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/courses', async (req, res) => {
  try {
    const payload = normalizeCoursePayload(req.body, false);
    if (!payload.title || !payload.description) {
      return res.status(400).json({ message: 'Title and description are required.' });
    }

    const course = await Course.create(payload);
    res.status(201).json({ course });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(400).json({ message: 'Course slug already exists.' });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.patch('/courses/:id', async (req, res) => {
  try {
    const payload = normalizeCoursePayload(req.body, true);
    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ message: 'No valid course fields provided.' });
    }

    const course = await Course.findByIdAndUpdate(
      req.params.id,
      { $set: payload },
      { new: true, runValidators: true }
    );

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    res.json({ course });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(400).json({ message: 'Course slug already exists.' });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.delete('/courses/:id', async (req, res) => {
  try {
    const course = await Course.findByIdAndUpdate(
      req.params.id,
      { $set: { is_published: false } },
      { new: true }
    );
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }
    res.json({
      message: 'Course unpublished successfully.',
      course
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/courses/:id/publish', async (req, res) => {
  try {
    const course = await Course.findByIdAndUpdate(
      req.params.id,
      { $set: { is_published: true } },
      { new: true }
    );
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }
    res.json({ course });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/cohorts', async (req, res) => {
  try {
    const cohorts = await Cohort.find()
      .populate('course_id', 'title slug category level')
      .sort({ start_date: 1 })
      .lean();

    const cohortIds = cohorts.map((cohort) => cohort._id);
    const enrollments = await Enrollment.find({ cohort_id: { $in: cohortIds } })
      .populate('user_id', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    const enrollmentMap = new Map();
    enrollments.forEach((enrollment) => {
      const key = String(enrollment.cohort_id);
      if (!enrollmentMap.has(key)) {
        enrollmentMap.set(key, []);
      }
      enrollmentMap.get(key).push(enrollment);
    });

    res.json({
      cohorts: cohorts.map((cohort) =>
        mapCohortWithEnrollments(
          cohort,
          enrollmentMap.get(String(cohort._id)) || []
        )
      )
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/cohorts', async (req, res) => {
  try {
    const payload = createCohortPayload(req.body);
    if (!payload) {
      return res.status(400).json({
        message: 'courseId, name, and valid startDate are required.'
      });
    }

    const course = await Course.findById(payload.course_id);
    if (!course) {
      return res.status(404).json({ message: 'Course not found.' });
    }

    const cohort = await Cohort.create(payload);
    const populated = await Cohort.findById(cohort._id)
      .populate('course_id', 'title slug category level')
      .lean();

    res.status(201).json({
      cohort: mapCohortWithEnrollments(populated, [])
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.patch('/cohorts/:id', async (req, res) => {
  try {
    const existing = await Cohort.findById(req.params.id).lean();
    if (!existing) {
      return res.status(404).json({ message: 'Cohort not found.' });
    }

    const payload = createCohortPayload(req.body, existing);
    if (!payload) {
      return res.status(400).json({
        message: 'Unable to apply cohort update. Check course and date fields.'
      });
    }

    const updated = await Cohort.findByIdAndUpdate(
      req.params.id,
      { $set: payload },
      { new: true, runValidators: true }
    )
      .populate('course_id', 'title slug category level')
      .lean();

    const enrollments = await Enrollment.find({ cohort_id: updated._id })
      .populate('user_id', 'name email')
      .lean();

    res.json({ cohort: mapCohortWithEnrollments(updated, enrollments) });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/cohorts/:id/enroll', async (req, res) => {
  try {
    const userId = String(req.body.userId || req.body.user_id || '').trim();
    const cohortId = req.params.id;
    const requestedStatus = String(req.body.status || 'active').trim();
    const status = ENROLLMENT_STATUSES.has(requestedStatus)
      ? requestedStatus
      : 'active';

    if (!userId) {
      return res.status(400).json({ message: 'userId is required.' });
    }

    const [student, cohort] = await Promise.all([
      User.findOne({ _id: userId, role: 'student' }),
      Cohort.findById(cohortId)
    ]);

    if (!student) {
      return res.status(404).json({ message: 'Student not found.' });
    }
    if (!cohort) {
      return res.status(404).json({ message: 'Cohort not found.' });
    }

    const existingEnrollment = await Enrollment.findOne({
      user_id: userId,
      cohort_id: cohortId
    });
    if (existingEnrollment) {
      return res.status(400).json({ message: 'Student already enrolled.' });
    }

    const activeEnrollmentCount = await Enrollment.countDocuments({
      cohort_id: cohortId,
      status: { $ne: 'dropped' }
    });
    if (activeEnrollmentCount >= cohort.max_students) {
      return res.status(400).json({ message: 'Cohort is full.' });
    }

    const enrollment = await Enrollment.create({
      user_id: userId,
      cohort_id: cohortId,
      status
    });

    const populated = await Enrollment.findById(enrollment._id)
      .populate('user_id', 'name email')
      .lean();

    res.status(201).json({ enrollment: mapEnrollment(populated) });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.patch('/enrollments/:id', async (req, res) => {
  try {
    const requestedStatus = String(req.body.status || '').trim();
    if (!ENROLLMENT_STATUSES.has(requestedStatus)) {
      return res.status(400).json({
        message: 'Invalid status. Use active, completed, or dropped.'
      });
    }

    const enrollment = await Enrollment.findByIdAndUpdate(
      req.params.id,
      { $set: { status: requestedStatus } },
      { new: true, runValidators: true }
    )
      .populate('user_id', 'name email')
      .lean();

    if (!enrollment) {
      return res.status(404).json({ message: 'Enrollment not found.' });
    }

    res.json({ enrollment: mapEnrollment(enrollment) });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/certificates', async (req, res) => {
  try {
    const certificates = await Certificate.find()
      .populate('user_id', 'name email')
      .populate('cohort_id', 'name')
      .populate('course_id', 'title slug')
      .populate('enrollment_id', '_id status')
      .sort({ issued_at: -1 })
      .lean();

    res.json({
      certificates: certificates.map(mapCertificate)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/certificates', async (req, res) => {
  try {
    const enrollmentId = String(req.body?.enrollmentId || req.body?.enrollment_id || '').trim();
    if (!enrollmentId) {
      return res.status(400).json({ message: 'enrollmentId is required.' });
    }

    const enrollment = await Enrollment.findById(enrollmentId)
      .populate('user_id', 'name email')
      .populate({
        path: 'cohort_id',
        populate: {
          path: 'course_id',
          select: 'title slug'
        }
      })
      .lean();

    if (!enrollment) {
      return res.status(404).json({ message: 'Enrollment not found.' });
    }

    if ((enrollment.status || 'active') !== 'completed') {
      return res.status(400).json({
        message: 'Certificate can only be issued for completed enrollments.'
      });
    }

    const existing = await Certificate.findOne({
      enrollment_id: enrollmentId
    })
      .populate('user_id', 'name email')
      .populate('cohort_id', 'name')
      .populate('course_id', 'title slug')
      .populate('enrollment_id', '_id status')
      .lean();

    if (existing) {
      return res.json({
        certificate: mapCertificate(existing),
        alreadyIssued: true
      });
    }

    if (!enrollment.cohort_id?.course_id?._id) {
      return res.status(400).json({ message: 'Enrollment does not contain a valid course.' });
    }

    const certificateNumber = await generateUniqueCertificateNumber();
    const certificate = await Certificate.create({
      certificate_number: certificateNumber,
      enrollment_id: enrollment._id,
      user_id: enrollment.user_id?._id || enrollment.user_id,
      cohort_id: enrollment.cohort_id?._id || enrollment.cohort_id,
      course_id: enrollment.cohort_id?.course_id?._id,
      issued_by: req.user._id,
      status: 'issued',
      issued_at: new Date()
    });

    const populated = await Certificate.findById(certificate._id)
      .populate('user_id', 'name email')
      .populate('cohort_id', 'name')
      .populate('course_id', 'title slug')
      .populate('enrollment_id', '_id status')
      .lean();

    await createNotification({
      userId: certificate.user_id,
      type: 'certificate',
      title: 'Certificate issued',
      message:
        'Your course certificate has been issued and is now available in your student dashboard.',
      meta: {
        certificateNumber: certificate.certificate_number,
        enrollmentId: enrollment._id
      }
    });

    res.status(201).json({
      certificate: mapCertificate(populated),
      alreadyIssued: false
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(400).json({
        message: 'Certificate already exists for this enrollment.'
      });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/payments', async (req, res) => {
  try {
    const payments = await Payment.find()
      .populate('user_id', 'name email')
      .populate(
        'application_id',
        '_id status payment_status course_title course_slug cohort_name'
      )
      .populate('confirmed_by', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      payments: payments.map(mapPayment)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.patch('/payments/:id', async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({ message: 'Payment record not found.' });
    }

    const payload = {};
    if (hasOwn(req.body, 'status')) {
      const status = String(req.body.status || '').trim();
      if (!PAYMENT_RECORD_STATUSES.has(status)) {
        return res.status(400).json({
          message:
            'Invalid payment status. Use initiated, pending_review, confirmed, failed, or refunded.'
        });
      }
      payload.status = status;
    }

    if (hasOwn(req.body, 'adminNotes') || hasOwn(req.body, 'admin_notes')) {
      payload.admin_notes = String(
        req.body.adminNotes ?? req.body.admin_notes ?? ''
      ).trim();
    }

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({
        message: 'No valid payment fields provided.'
      });
    }

    if (payload.status === 'confirmed') {
      payload.confirmed_at = new Date();
      payload.confirmed_by = req.user._id;
    } else if (payload.status) {
      payload.confirmed_at = null;
      payload.confirmed_by = null;
    }

    Object.entries(payload).forEach(([key, value]) => {
      payment.set(key, value);
    });
    await payment.save();

    if (payment.application_id) {
      const nextPaymentStatus = payment.status === 'confirmed' ? 'confirmed' : 'pending';
      await CohortApplication.findByIdAndUpdate(payment.application_id, {
        $set: { payment_status: nextPaymentStatus }
      });
    }

    if (payment.user_id) {
      const statusText = payment.status || 'initiated';
      await createNotification({
        userId: payment.user_id,
        type: 'payment',
        title: 'Payment status updated',
        message: `Your payment ${payment.reference} is now marked as ${statusText}.`,
        meta: {
          paymentId: payment._id,
          paymentReference: payment.reference,
          status: statusText
        }
      });
    }

    const populated = await Payment.findById(payment._id)
      .populate('user_id', 'name email')
      .populate(
        'application_id',
        '_id status payment_status course_title course_slug cohort_name'
      )
      .populate('confirmed_by', 'name email')
      .lean();

    res.json({
      payment: mapPayment(populated)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/cohort-applications', async (req, res) => {
  try {
    const applications = await CohortApplication.find()
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

router.patch('/cohort-applications/:id', async (req, res) => {
  try {
    const existing = await CohortApplication.findById(req.params.id).lean();
    if (!existing) {
      return res.status(404).json({ message: 'Cohort application not found.' });
    }

    const payload = {};
    if (hasOwn(req.body, 'status')) {
      const status = String(req.body.status || '').trim();
      if (!APPLICATION_STATUSES.has(status)) {
        return res.status(400).json({
          message: 'Invalid status. Use new, contacted, admitted, or closed.'
        });
      }
      payload.status = status;
    }

    if (hasOwn(req.body, 'paymentStatus') || hasOwn(req.body, 'payment_status')) {
      const paymentStatus = String(
        req.body.paymentStatus ?? req.body.payment_status ?? ''
      ).trim();
      if (!PAYMENT_STATUSES.has(paymentStatus)) {
        return res.status(400).json({
          message: 'Invalid payment status. Use pending, confirmed, or waived.'
        });
      }
      payload.payment_status = paymentStatus;
    }

    if (hasOwn(req.body, 'adminNotes') || hasOwn(req.body, 'admin_notes')) {
      payload.admin_notes = String(
        req.body.adminNotes ?? req.body.admin_notes ?? ''
      ).trim();
    }

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({
        message: 'No valid cohort application fields provided.'
      });
    }

    const application = await CohortApplication.findByIdAndUpdate(
      req.params.id,
      { $set: payload },
      { new: true, runValidators: true }
    )
      .populate('user_id', 'name email')
      .populate('course_id', 'title slug')
      .populate('cohort_id', 'name')
      .lean();

    if (!application) {
      return res.status(404).json({ message: 'Cohort application not found.' });
    }

    if (application.user_id?._id) {
      if (
        typeof payload.status === 'string' &&
        payload.status !== (existing.status || 'new')
      ) {
        await createNotification({
          userId: application.user_id._id,
          type: 'cohort_application',
          title: 'Application status updated',
          message: `Your cohort application status is now ${payload.status}.`,
          meta: {
            applicationId: application._id,
            status: payload.status
          }
        });
      }

      if (
        typeof payload.payment_status === 'string' &&
        payload.payment_status !== (existing.payment_status || 'pending')
      ) {
        await createNotification({
          userId: application.user_id._id,
          type: 'payment',
          title: 'Application payment status updated',
          message: `Your cohort application payment is now ${payload.payment_status}.`,
          meta: {
            applicationId: application._id,
            paymentStatus: payload.payment_status
          }
        });
      }
    }

    res.json({
      application: mapCohortApplication(application)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/announcements', async (req, res) => {
  try {
    const { cohort_id, message } = req.body;
    const announcement = new Announcement({ cohort_id, message });
    await announcement.save();
    res.status(201).json(announcement);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/materials', async (req, res) => {
  try {
    const { course_id, title, type, url } = req.body;
    const material = new Material({ course_id, title, type, url });
    await material.save();
    res.status(201).json(material);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
