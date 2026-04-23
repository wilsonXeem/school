const express = require('express');
const mongoose = require('mongoose');
const { Enrollment, Announcement, Material } = require('../models');
const Course = require('../models/Course');
const Progress = require('../models/Progress');
const Lesson = require('../models/Lesson');
const LessonProgress = require('../models/LessonProgress');
const WhiteboardNote = require('../models/WhiteboardNote');
const CourseNote = require('../models/CourseNote');
const Certificate = require('../models/Certificate');
const Payment = require('../models/Payment');
const Notification = require('../models/Notification');
const CohortApplication = require('../models/CohortApplication');
const User = require('../models/User');
const Cohort = require('../models/Cohort');
const { createNotification } = require('../lib/notifications');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Apply auth middleware to all student routes
router.use(auth);

const clamp = (value, min, max, fallback) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
};

const normalizeSnapshot = (raw = {}) => {
  const objects = Array.isArray(raw.objects) ? raw.objects : [];
  const stageScale = clamp(raw.stageScale, 0.2, 4, 0.75);
  const stagePosition = {
    x: clamp(raw.stagePosition?.x, -20000, 20000, 60),
    y: clamp(raw.stagePosition?.y, -20000, 20000, 40)
  };

  return {
    objects,
    stageScale,
    stagePosition
  };
};

const PAYMENT_PRICING = Object.freeze({
  cohort_training: 100000,
  certification: 50000
});
const PAYSTACK_BASE_URL = 'https://api.paystack.co';

const PAYMENT_METHODS = new Set(['bank_transfer', 'card', 'cash', 'other']);
const PAYMENT_MUTABLE_STATUSES = new Set(['initiated', 'pending_review', 'failed']);
const LEGACY_COHORT_ACCESS_FILTER = {
  $or: [{ access_type: 'cohort' }, { access_type: { $exists: false } }]
};

const PAYMENT_INSTRUCTIONS = {
  bankName: process.env.PAYMENT_BANK_NAME || 'ProgrammoCeuticals Bank',
  accountName: process.env.PAYMENT_ACCOUNT_NAME || 'ProgrammoCeuticals Ltd',
  accountNumber: process.env.PAYMENT_ACCOUNT_NUMBER || '0001234567',
  currency: 'NGN',
  note: 'Use your payment reference as transfer narration.'
};

const toObjectIdOrNull = (value) => {
  const stringValue = String(value || '').trim();
  if (!stringValue || !mongoose.Types.ObjectId.isValid(stringValue)) {
    return null;
  }
  return new mongoose.Types.ObjectId(stringValue);
};

const buildPaymentReference = (type) => {
  const prefix = type === 'certification' ? 'CERT' : 'COH';
  const timestamp = Date.now().toString().slice(-8);
  const token = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `PCP-${prefix}-${timestamp}-${token}`;
};

const generateUniquePaymentReference = async (type) => {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = buildPaymentReference(type);
    const exists = await Payment.findOne({ reference: candidate })
      .select('_id')
      .lean();
    if (!exists) {
      return candidate;
    }
  }
  return `PCP-${Date.now()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
};

const isPaystackConfigured = () => Boolean(process.env.PAYSTACK_SECRET_KEY);

const getFrontendBaseUrl = () => {
  const configured = String(process.env.FRONTEND_URL || '').trim();
  if (configured) {
    return configured.replace(/\/+$/, '');
  }
  return 'http://localhost:3000';
};

const getPaystackCallbackUrl = () => {
  const configured = String(process.env.PAYSTACK_CALLBACK_URL || '').trim();
  if (configured) {
    return configured;
  }
  return `${getFrontendBaseUrl()}/#/my-courses`;
};

const paystackRequest = async (path, { method = 'GET', body } = {}) => {
  if (!isPaystackConfigured()) {
    throw new Error('PAYSTACK_SECRET_KEY is not configured');
  }
  if (typeof fetch !== 'function') {
    throw new Error('Fetch API is unavailable on this Node runtime.');
  }

  const response = await fetch(`${PAYSTACK_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.status === false) {
    throw new Error(payload.message || 'Paystack request failed');
  }

  return payload.data;
};

const mapPayment = (payment) => ({
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
  confirmedAt: payment.confirmed_at || null,
  adminNotes: payment.admin_notes || '',
  createdAt: payment.createdAt,
  updatedAt: payment.updatedAt,
  application: payment.application_id
    ? {
        id: payment.application_id._id || payment.application_id,
        status: payment.application_id.status,
        paymentStatus: payment.application_id.payment_status,
        courseTitle:
          payment.application_id.course_title ||
          payment.metadata?.courseTitle ||
          '',
        courseSlug:
          payment.application_id.course_slug ||
          payment.metadata?.courseSlug ||
          '',
        cohortName:
          payment.application_id.cohort_name ||
          payment.metadata?.cohortName ||
          ''
      }
    : null,
  enrollment: payment.enrollment_id
    ? {
        id: payment.enrollment_id._id || payment.enrollment_id,
        status: payment.enrollment_id.status || ''
      }
    : null
});

const mapNotification = (notification) => ({
  id: notification._id,
  type: notification.type || 'system',
  title: notification.title,
  message: notification.message,
  isRead: Boolean(notification.is_read),
  readAt: notification.read_at || null,
  meta: notification.meta || {},
  createdAt: notification.createdAt,
  updatedAt: notification.updatedAt
});

const mapSelfPacedEnrollment = (enrollment) => ({
  id: enrollment._id,
  accessType: enrollment.access_type || 'self_paced',
  status: enrollment.status || 'active',
  createdAt: enrollment.createdAt,
  updatedAt: enrollment.updatedAt,
  course: enrollment.course_id
    ? {
        id: enrollment.course_id._id,
        title: enrollment.course_id.title,
        slug: enrollment.course_id.slug,
        description: enrollment.course_id.description,
        level: enrollment.course_id.level,
        category: enrollment.course_id.category
      }
    : null
});

const mapLessonProgress = (entry) => ({
  id: entry._id,
  status: entry.status || 'in_progress',
  percentComplete: entry.percent_complete || 0,
  lastPosition: entry.last_position || {},
  startedAt: entry.started_at || entry.createdAt,
  completedAt: entry.completed_at || null,
  updatedAt: entry.updatedAt,
  lesson: entry.lesson_id
    ? {
        id: entry.lesson_id._id,
        title: entry.lesson_id.title,
        slug: entry.lesson_id.slug,
        moduleId: entry.lesson_id.module_id,
        courseId: entry.lesson_id.course_id
      }
    : null,
  module: entry.module_id
    ? {
        id: entry.module_id._id || entry.module_id,
        title: entry.module_id.title || ''
      }
    : null,
  course: entry.course_id
    ? {
        id: entry.course_id._id || entry.course_id,
        title: entry.course_id.title || '',
        slug: entry.course_id.slug || ''
      }
    : null
});

// Get student dashboard data
router.get('/dashboard', async (req, res) => {
  try {
    const enrollment = await Enrollment.findOne({ 
      user_id: req.user._id,
      status: 'active',
      ...LEGACY_COHORT_ACCESS_FILTER
    }).populate({
      path: 'cohort_id',
      populate: [
        { path: 'course_id' },
        { path: 'timetable_id' }
      ]
    });

    if (!enrollment) {
      return res.json({ message: 'No active enrollment found' });
    }

    // Get announcements for the cohort
    const announcements = await Announcement.find({
      cohort_id: enrollment.cohort_id._id
    }).sort({ created_at: -1 }).limit(5);

    res.json({
      course: enrollment.cohort_id.course_id,
      cohort: {
        name: enrollment.cohort_id.name,
        start_date: enrollment.cohort_id.start_date,
        end_date: enrollment.cohort_id.end_date
      },
      timetable: enrollment.cohort_id.timetable_id,
      announcements
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get student schedule
router.get('/schedule', async (req, res) => {
  try {
    const enrollment = await Enrollment.findOne({ 
      user_id: req.user._id,
      status: 'active',
      ...LEGACY_COHORT_ACCESS_FILTER
    }).populate({
      path: 'cohort_id',
      populate: { path: 'timetable_id' }
    });

    if (!enrollment) {
      return res.status(404).json({ message: 'No active enrollment found' });
    }

    res.json({
      cohort: enrollment.cohort_id.name,
      timetable: enrollment.cohort_id.timetable_id
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get course materials
router.get('/materials', async (req, res) => {
  try {
    const enrollment = await Enrollment.findOne({ 
      user_id: req.user._id,
      status: 'active',
      ...LEGACY_COHORT_ACCESS_FILTER
    }).populate('cohort_id');

    if (!enrollment) {
      return res.status(404).json({ message: 'No active enrollment found' });
    }

    const materials = await Material.find({
      course_id: enrollment.cohort_id.course_id
    }).sort({ created_at: -1 });

    res.json(materials);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get all progress entries for student
router.get('/progress', async (req, res) => {
  try {
    const progress = await Progress.find({ user_id: req.user._id }).sort({ updated_at: -1 });
    res.json({ progress });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get progress for a specific course
router.get('/progress/:courseId', async (req, res) => {
  try {
    const progress = await Progress.findOne({
      user_id: req.user._id,
      course_id: req.params.courseId
    });
    res.json({ progress });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Upsert progress for a course
router.post('/progress', async (req, res) => {
  try {
    const { courseId, lastSlideIndex, completedSlides, totalSlides } = req.body;

    const progress = await Progress.findOneAndUpdate(
      { user_id: req.user._id, course_id: courseId },
      {
        course_id: courseId,
        last_slide_index: lastSlideIndex,
        completed_slides: completedSlides,
        total_slides: totalSlides,
        updated_at: new Date()
      },
      { new: true, upsert: true }
    );

    res.json({ progress });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get lesson progress for a course
router.get('/lesson-progress/course/:courseSlug', async (req, res) => {
  try {
    const course = await Course.findOne({ slug: req.params.courseSlug })
      .select('_id title slug')
      .lean();

    if (!course) {
      return res.status(404).json({ message: 'Course not found.' });
    }

    const progress = await LessonProgress.find({
      user_id: req.user._id,
      course_id: course._id
    })
      .populate('course_id', 'title slug')
      .populate('module_id', 'title')
      .populate('lesson_id', 'title slug module_id course_id')
      .sort({ updatedAt: -1 })
      .lean();

    res.json({
      course: {
        id: course._id,
        title: course.title,
        slug: course.slug
      },
      progress: progress.map(mapLessonProgress)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get lesson progress for a specific lesson
router.get('/lesson-progress/lesson/:lessonId', async (req, res) => {
  try {
    const progress = await LessonProgress.findOne({
      user_id: req.user._id,
      lesson_id: req.params.lessonId
    })
      .populate('course_id', 'title slug')
      .populate('module_id', 'title')
      .populate('lesson_id', 'title slug module_id course_id')
      .lean();

    res.json({
      progress: progress ? mapLessonProgress(progress) : null
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Upsert lesson progress
router.put('/lesson-progress/lesson/:lessonId', async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.lessonId)
      .select('_id course_id module_id')
      .lean();

    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found.' });
    }

    const requestedStatus = String(req.body?.status || '').trim();
    const percentComplete = clamp(
      req.body?.percentComplete ?? req.body?.percent_complete,
      0,
      100,
      0
    );
    const status =
      requestedStatus === 'completed'
        ? 'completed'
        : requestedStatus === 'not_started'
          ? 'not_started'
          : 'in_progress';
    const lastPosition =
      req.body?.lastPosition && typeof req.body.lastPosition === 'object'
        ? req.body.lastPosition
        : req.body?.last_position && typeof req.body.last_position === 'object'
          ? req.body.last_position
          : {};

    const progress = await LessonProgress.findOneAndUpdate(
      {
        user_id: req.user._id,
        lesson_id: lesson._id
      },
      {
        $set: {
          course_id: lesson.course_id,
          module_id: lesson.module_id,
          lesson_id: lesson._id,
          status,
          percent_complete: percentComplete,
          last_position: lastPosition,
          completed_at: status === 'completed' ? new Date() : null
        },
        $setOnInsert: {
          started_at: new Date()
        }
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true
      }
    )
      .populate('course_id', 'title slug')
      .populate('module_id', 'title')
      .populate('lesson_id', 'title slug module_id course_id')
      .lean();

    res.json({
      progress: mapLessonProgress(progress)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Enroll user in a self-paced course
router.post('/enrollments/self-paced', async (req, res) => {
  try {
    const courseId = String(req.body?.courseId || req.body?.course_id || '').trim();
    const courseSlug = String(req.body?.courseSlug || req.body?.course_slug || '').trim();

    let course = null;
    if (courseId && mongoose.Types.ObjectId.isValid(courseId)) {
      course = await Course.findOne({ _id: courseId, is_published: true })
        .select('_id title slug description level category')
        .lean();
    }

    if (!course && courseSlug) {
      course = await Course.findOne({ slug: courseSlug, is_published: true })
        .select('_id title slug description level category')
        .lean();
    }

    if (!course) {
      return res.status(404).json({ message: 'Course not found.' });
    }

    const existingEnrollment = await Enrollment.findOne({
      user_id: req.user._id,
      course_id: course._id,
      access_type: 'self_paced'
    })
      .populate('course_id', 'title slug description level category')
      .lean();

    if (existingEnrollment) {
      return res.json({
        enrollment: mapSelfPacedEnrollment(existingEnrollment),
        alreadyEnrolled: true
      });
    }

    const enrollment = await Enrollment.create({
      user_id: req.user._id,
      course_id: course._id,
      access_type: 'self_paced',
      status: 'active'
    });

    const populated = await Enrollment.findById(enrollment._id)
      .populate('course_id', 'title slug description level category')
      .lean();

    res.status(201).json({
      enrollment: mapSelfPacedEnrollment(populated)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get self-paced course enrollments
router.get('/enrollments/self-paced', async (req, res) => {
  try {
    const enrollments = await Enrollment.find({
      user_id: req.user._id,
      access_type: 'self_paced'
    })
      .populate('course_id', 'title slug description level category')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      enrollments: enrollments.map(mapSelfPacedEnrollment)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get student enrollments with cohorts and courses
router.get('/enrollments', async (req, res) => {
  try {
    const enrollments = await Enrollment.find({
      user_id: req.user._id,
      ...LEGACY_COHORT_ACCESS_FILTER
    })
      .populate({
        path: 'cohort_id',
        populate: { path: 'course_id' }
      })
      .sort({ createdAt: -1 });

    res.json({ enrollments });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get student certificates
router.get('/certificates', async (req, res) => {
  try {
    const certificates = await Certificate.find({
      user_id: req.user._id,
      status: 'issued'
    })
      .populate('course_id', 'title slug')
      .populate('cohort_id', 'name')
      .sort({ issued_at: -1 })
      .lean();

    res.json({
      certificates: certificates.map((certificate) => ({
        id: certificate._id,
        certificateNumber: certificate.certificate_number,
        issuedAt: certificate.issued_at || certificate.createdAt,
        course: certificate.course_id
          ? {
              id: certificate.course_id._id,
              title: certificate.course_id.title,
              slug: certificate.course_id.slug
            }
          : null,
        cohort: certificate.cohort_id
          ? {
              id: certificate.cohort_id._id,
              name: certificate.cohort_id.name
            }
          : null
      }))
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update student interested courses
router.patch('/interests', async (req, res) => {
  try {
    const { interestedCourses } = req.body;
    const nextCourses = Array.isArray(interestedCourses) ? interestedCourses : [];

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { interested_courses: nextCourses },
      { new: true }
    );

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        interestedCourses: user.interested_courses
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/payments', async (req, res) => {
  try {
    const type = String(req.query.type || '').trim();
    const filter = { user_id: req.user._id };
    if (type) {
      filter.type = type;
    }

    const payments = await Payment.find(filter)
      .populate(
        'application_id',
        '_id status payment_status course_title course_slug cohort_name'
      )
      .populate('enrollment_id', '_id status')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      payments: payments.map(mapPayment),
      pricing: PAYMENT_PRICING,
      instructions: PAYMENT_INSTRUCTIONS
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/payments/initiate', async (req, res) => {
  try {
    const typeCandidate = String(req.body?.type || '')
      .trim()
      .toLowerCase();
    const type = typeCandidate === 'certification' ? 'certification' : 'cohort_training';
    const methodCandidate = String(req.body?.method || 'bank_transfer').trim();
    const method = PAYMENT_METHODS.has(methodCandidate)
      ? methodCandidate
      : 'bank_transfer';
    const providerCandidate = String(req.body?.provider || '').trim().toLowerCase();
    const provider = providerCandidate === 'paystack' ? 'paystack' : 'manual';

    let application = null;
    let enrollment = null;
    let metadata = {};
    const filter = { user_id: req.user._id, type };

    if (type === 'cohort_training') {
      const applicationId = toObjectIdOrNull(req.body?.applicationId || req.body?.application_id);
      if (!applicationId) {
        return res.status(400).json({
          message: 'applicationId is required for cohort training payment.'
        });
      }

      application = await CohortApplication.findOne({
        _id: applicationId,
        $or: [{ user_id: req.user._id }, { email: req.user.email }]
      }).lean();

      if (!application) {
        return res.status(404).json({ message: 'Cohort application not found.' });
      }

      if (application.payment_status === 'confirmed') {
        return res.status(400).json({
          message: 'Payment already confirmed for this application.'
        });
      }

      filter.application_id = applicationId;
      metadata = {
        courseTitle: application.course_title || '',
        courseSlug: application.course_slug || '',
        cohortName: application.cohort_name || ''
      };
    } else {
      const enrollmentId = toObjectIdOrNull(req.body?.enrollmentId || req.body?.enrollment_id);
      if (!enrollmentId) {
        return res.status(400).json({
          message: 'enrollmentId is required for certification payment.'
        });
      }

      enrollment = await Enrollment.findOne({
        _id: enrollmentId,
        user_id: req.user._id,
        status: 'completed',
        ...LEGACY_COHORT_ACCESS_FILTER
      }).lean();

      if (!enrollment) {
        return res.status(404).json({
          message: 'Completed enrollment not found for certification payment.'
        });
      }

      filter.enrollment_id = enrollmentId;
      metadata = {
        enrollmentId: String(enrollment._id)
      };
    }

    const existing = await Payment.findOne({
      ...filter,
      status: { $in: ['initiated', 'pending_review'] }
    })
      .populate(
        'application_id',
        '_id status payment_status course_title course_slug cohort_name'
      )
      .populate('enrollment_id', '_id status')
      .lean();

    if (existing) {
      if (
        provider === 'paystack' &&
        existing.provider === 'paystack' &&
        existing.authorization_url
      ) {
        return res.json({
          payment: mapPayment(existing),
          existing: true,
          authorization_url: existing.authorization_url,
          access_code: existing.access_code || null,
          instructions: PAYMENT_INSTRUCTIONS,
          pricing: PAYMENT_PRICING
        });
      }

      return res.json({
        payment: mapPayment(existing),
        existing: true,
        instructions: PAYMENT_INSTRUCTIONS,
        pricing: PAYMENT_PRICING
      });
    }

    const reference = await generateUniquePaymentReference(type);
    const payment = await Payment.create({
      user_id: req.user._id,
      application_id: application?._id || null,
      enrollment_id: enrollment?._id || null,
      type,
      amount: PAYMENT_PRICING[type],
      currency: 'NGN',
      reference,
      method,
      provider,
      status: 'initiated',
      metadata
    });

    if (application?._id) {
      await CohortApplication.findByIdAndUpdate(application._id, {
        $set: { payment_status: 'pending' }
      });
    }

    await createNotification({
      userId: req.user._id,
      type: 'payment',
      title: 'Payment initiated',
      message:
        'Your payment request has been created. Submit transfer proof to complete review.',
      meta: {
        paymentId: payment._id,
        paymentReference: payment.reference,
        paymentType: type
      }
    });

    if (provider === 'paystack') {
      if (!isPaystackConfigured()) {
        await Payment.findByIdAndUpdate(payment._id, {
          $set: {
            status: 'failed',
            provider_status: 'gateway_not_configured',
            failure_reason: 'Paystack is not configured on server.'
          }
        });
        return res.status(500).json({
          message: 'Payment gateway is not configured.'
        });
      }

      try {
        const amountKobo = Number(payment.amount || 0) * 100;
        const paystackData = await paystackRequest('/transaction/initialize', {
          method: 'POST',
          body: {
            email: req.user.email,
            amount: amountKobo,
            reference: payment.reference,
            callback_url: getPaystackCallbackUrl(),
            metadata: {
              userId: String(req.user._id),
              paymentId: String(payment._id),
              type: payment.type,
              applicationId: payment.application_id ? String(payment.application_id) : null,
              enrollmentId: payment.enrollment_id ? String(payment.enrollment_id) : null,
              amountNaira: payment.amount
            }
          }
        });

        await Payment.findByIdAndUpdate(payment._id, {
          $set: {
            provider_status: 'initialized',
            authorization_url: paystackData.authorization_url || '',
            access_code: paystackData.access_code || '',
            gateway_response: paystackData
          }
        });

        const initialized = await Payment.findById(payment._id)
          .populate(
            'application_id',
            '_id status payment_status course_title course_slug cohort_name'
          )
          .populate('enrollment_id', '_id status')
          .lean();

        return res.status(201).json({
          payment: mapPayment(initialized),
          existing: false,
          authorization_url: paystackData.authorization_url,
          access_code: paystackData.access_code || null,
          instructions: PAYMENT_INSTRUCTIONS,
          pricing: PAYMENT_PRICING
        });
      } catch (gatewayError) {
        await Payment.findByIdAndUpdate(payment._id, {
          $set: {
            status: 'failed',
            provider_status: 'initialize_failed',
            failure_reason: gatewayError.message || 'Failed to initialize Paystack payment.'
          }
        });
        return res.status(502).json({
          message: gatewayError.message || 'Failed to initialize gateway payment.'
        });
      }
    }

    const populated = await Payment.findById(payment._id)
      .populate(
        'application_id',
        '_id status payment_status course_title course_slug cohort_name'
      )
      .populate('enrollment_id', '_id status')
      .lean();

    res.status(201).json({
      payment: mapPayment(populated),
      existing: false,
      instructions: PAYMENT_INSTRUCTIONS,
      pricing: PAYMENT_PRICING
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(400).json({
        message: 'Duplicate payment reference detected. Retry request.'
      });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/payments/verify/:reference', async (req, res) => {
  try {
    const reference = String(req.params.reference || '').trim();
    if (!reference) {
      return res.status(400).json({ message: 'Payment reference is required.' });
    }

    const payment = await Payment.findOne({
      reference,
      user_id: req.user._id
    });
    if (!payment) {
      return res.status(404).json({ message: 'Payment record not found.' });
    }

    if (payment.provider !== 'paystack') {
      return res.status(400).json({
        message: 'Only paystack payments can be verified through this endpoint.'
      });
    }

    if (!isPaystackConfigured()) {
      return res.status(500).json({ message: 'Payment gateway is not configured.' });
    }

    if (payment.status === 'confirmed' && payment.confirmed_at) {
      const alreadyConfirmed = await Payment.findById(payment._id)
        .populate(
          'application_id',
          '_id status payment_status course_title course_slug cohort_name'
        )
        .populate('enrollment_id', '_id status')
        .lean();

      return res.json({
        verified: true,
        payment: mapPayment(alreadyConfirmed)
      });
    }

    let paystackData;
    try {
      paystackData = await paystackRequest(
        `/transaction/verify/${encodeURIComponent(reference)}`
      );
    } catch (gatewayError) {
      return res.status(502).json({
        message: gatewayError.message || 'Failed to verify gateway payment.'
      });
    }

    payment.provider_status = String(paystackData.status || 'unknown');
    payment.gateway_response = paystackData;
    payment.verified_at = new Date();
    payment.paid_at = paystackData.paid_at ? new Date(paystackData.paid_at) : payment.paid_at;

    if (String(paystackData.status || '').toLowerCase() !== 'success') {
      payment.status = 'failed';
      payment.failure_reason = `Paystack status: ${paystackData.status || 'unknown'}`;
      await payment.save();

      return res.status(400).json({
        verified: false,
        message: 'Payment not successful.',
        payment: mapPayment(payment)
      });
    }

    const paidAmount = Number(paystackData.amount || 0);
    const expectedAmount = Number(payment.amount || 0) * 100;
    if (paidAmount !== expectedAmount) {
      payment.status = 'failed';
      payment.failure_reason = 'Amount mismatch during verification.';
      await payment.save();

      return res.status(400).json({
        verified: false,
        message: 'Payment verification failed due to amount mismatch.',
        payment: mapPayment(payment)
      });
    }

    const customerEmail = String(paystackData.customer?.email || '')
      .trim()
      .toLowerCase();
    const userEmail = String(req.user.email || '')
      .trim()
      .toLowerCase();
    if (customerEmail && userEmail && customerEmail !== userEmail) {
      payment.status = 'failed';
      payment.failure_reason = 'Email mismatch during verification.';
      await payment.save();

      return res.status(400).json({
        verified: false,
        message: 'Payment verification failed due to email mismatch.',
        payment: mapPayment(payment)
      });
    }

    payment.status = 'confirmed';
    payment.failure_reason = '';
    payment.confirmed_at = new Date();
    payment.proof_submitted_at = payment.proof_submitted_at || new Date();
    await payment.save();

    if (payment.application_id) {
      await CohortApplication.findByIdAndUpdate(payment.application_id, {
        $set: { payment_status: 'confirmed' }
      });
    }

    await createNotification({
      userId: req.user._id,
      type: 'payment',
      title: 'Payment confirmed',
      message:
        'Your payment has been verified successfully and confirmed.',
      meta: {
        paymentId: payment._id,
        paymentReference: payment.reference
      }
    });

    const populated = await Payment.findById(payment._id)
      .populate(
        'application_id',
        '_id status payment_status course_title course_slug cohort_name'
      )
      .populate('enrollment_id', '_id status')
      .lean();

    return res.json({
      verified: true,
      payment: mapPayment(populated)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.patch('/payments/:paymentId/proof', async (req, res) => {
  try {
    const paymentId = toObjectIdOrNull(req.params.paymentId);
    if (!paymentId) {
      return res.status(400).json({ message: 'Invalid payment ID.' });
    }

    const payment = await Payment.findOne({
      _id: paymentId,
      user_id: req.user._id
    });

    if (!payment) {
      return res.status(404).json({ message: 'Payment record not found.' });
    }

    if (!PAYMENT_MUTABLE_STATUSES.has(payment.status)) {
      return res.status(400).json({
        message: `Payment in "${payment.status}" state cannot be updated.`
      });
    }

    const methodCandidate = String(req.body?.method || payment.method || 'bank_transfer').trim();
    const method = PAYMENT_METHODS.has(methodCandidate)
      ? methodCandidate
      : payment.method || 'bank_transfer';
    const proofReference = String(
      req.body?.transactionReference ||
        req.body?.proofReference ||
        req.body?.proof_reference ||
        ''
    ).trim();
    const proofNote = String(req.body?.note || req.body?.proofNote || '').trim();

    payment.method = method;
    payment.proof_reference = proofReference;
    payment.proof_note = proofNote;
    payment.proof_submitted_at = new Date();
    payment.status = 'pending_review';
    await payment.save();

    await createNotification({
      userId: req.user._id,
      type: 'payment',
      title: 'Payment proof submitted',
      message:
        'Your payment proof was submitted successfully and is pending admin review.',
      meta: {
        paymentId: payment._id,
        paymentReference: payment.reference
      }
    });

    const populated = await Payment.findById(payment._id)
      .populate(
        'application_id',
        '_id status payment_status course_title course_slug cohort_name'
      )
      .populate('enrollment_id', '_id status')
      .lean();

    res.json({
      payment: mapPayment(populated)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/notifications', async (req, res) => {
  try {
    const limit = clamp(req.query.limit, 1, 100, 30);
    const notifications = await Notification.find({ user_id: req.user._id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    const unreadCount = await Notification.countDocuments({
      user_id: req.user._id,
      is_read: false
    });

    res.json({
      notifications: notifications.map(mapNotification),
      unreadCount
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.patch('/notifications/:id/read', async (req, res) => {
  try {
    const notificationId = toObjectIdOrNull(req.params.id);
    if (!notificationId) {
      return res.status(400).json({ message: 'Invalid notification ID.' });
    }

    const notification = await Notification.findOneAndUpdate(
      {
        _id: notificationId,
        user_id: req.user._id
      },
      {
        $set: {
          is_read: true,
          read_at: new Date()
        }
      },
      { new: true }
    ).lean();

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found.' });
    }

    res.json({
      notification: mapNotification(notification)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.patch('/notifications/read-all', async (req, res) => {
  try {
    await Notification.updateMany(
      {
        user_id: req.user._id,
        is_read: false
      },
      {
        $set: {
          is_read: true,
          read_at: new Date()
        }
      }
    );

    res.json({ message: 'Notifications marked as read.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get saved whiteboard note for a specific course slide
router.get('/whiteboard/lesson/:lessonId', async (req, res) => {
  try {
    const lessonId = String(req.params.lessonId || '').trim();
    if (!lessonId || !mongoose.Types.ObjectId.isValid(lessonId)) {
      return res.status(400).json({ message: 'Invalid lesson id.' });
    }

    const lesson = await Lesson.findById(lessonId)
      .populate('course_id', 'slug')
      .select('_id course_id source_slide_id')
      .lean();

    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found.' });
    }

    const legacyMatchers = [];
    if (lesson.course_id?.slug && lesson.source_slide_id) {
      legacyMatchers.push({
        course_id: lesson.course_id.slug,
        slide_index: lesson.source_slide_id
      });
    }

    const note = await WhiteboardNote.findOne({
      user_id: req.user._id,
      $or: [{ lesson_id: lessonId }, ...legacyMatchers]
    }).lean();

    if (!note) {
      return res.json({ note: null });
    }

    res.json({
      note: {
        id: note._id,
        lessonId: note.lesson_id,
        snapshot: normalizeSnapshot(note.snapshot || {}),
        updatedAt: note.updatedAt
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/whiteboard/lesson/:lessonId', async (req, res) => {
  try {
    const lessonId = String(req.params.lessonId || '').trim();
    if (!lessonId || !mongoose.Types.ObjectId.isValid(lessonId)) {
      return res.status(400).json({ message: 'Invalid lesson id.' });
    }

    const lesson = await Lesson.findById(lessonId)
      .populate('course_id', 'slug')
      .select('_id course_id source_slide_id')
      .lean();

    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found.' });
    }

    const snapshotInput = req.body?.snapshot || req.body?.state || req.body || {};
    const snapshot = normalizeSnapshot(snapshotInput);
    const legacyMatchers = [];
    if (lesson.course_id?.slug && lesson.source_slide_id) {
      legacyMatchers.push({
        course_id: lesson.course_id.slug,
        slide_index: lesson.source_slide_id
      });
    }

    const note = await WhiteboardNote.findOneAndUpdate(
      {
        user_id: req.user._id,
        $or: [{ lesson_id: lesson._id }, ...legacyMatchers]
      },
      {
        $set: {
          lesson_id: lesson._id,
          course_id: lesson.course_id?.slug || '',
          slide_index: lesson.source_slide_id || null,
          snapshot
        }
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true
      }
    ).lean();

    res.json({
      note: {
        id: note._id,
        lessonId: note.lesson_id,
        snapshot: normalizeSnapshot(note.snapshot || {}),
        updatedAt: note.updatedAt
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get saved whiteboard note for a specific course slide
router.get('/whiteboard/:courseId/:slideIndex', async (req, res) => {
  try {
    const courseId = String(req.params.courseId || '').trim();
    const slideIndex = Number(req.params.slideIndex);
    if (!courseId || !Number.isInteger(slideIndex) || slideIndex < 1) {
      return res.status(400).json({ message: 'Invalid course or slide index.' });
    }

    const note = await WhiteboardNote.findOne({
      user_id: req.user._id,
      course_id: courseId,
      slide_index: slideIndex
    }).lean();

    if (!note) {
      return res.json({ note: null });
    }

    res.json({
      note: {
        id: note._id,
        courseId: note.course_id,
        slideIndex: note.slide_index,
        snapshot: normalizeSnapshot(note.snapshot || {}),
        updatedAt: note.updatedAt
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Save whiteboard note snapshot for a specific course slide
router.put('/whiteboard/:courseId/:slideIndex', async (req, res) => {
  try {
    const courseId = String(req.params.courseId || '').trim();
    const slideIndex = Number(req.params.slideIndex);
    if (!courseId || !Number.isInteger(slideIndex) || slideIndex < 1) {
      return res.status(400).json({ message: 'Invalid course or slide index.' });
    }

    const snapshotInput = req.body?.snapshot || req.body?.state || req.body || {};
    const snapshot = normalizeSnapshot(snapshotInput);

    const note = await WhiteboardNote.findOneAndUpdate(
      {
        user_id: req.user._id,
        course_id: courseId,
        slide_index: slideIndex
      },
      {
        $set: {
          snapshot
        }
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true
      }
    ).lean();

    res.json({
      note: {
        id: note._id,
        courseId: note.course_id,
        slideIndex: note.slide_index,
        snapshot: normalizeSnapshot(note.snapshot || {}),
        updatedAt: note.updatedAt
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get text notes for a course
router.get('/notes/course/:courseSlug', async (req, res) => {
  try {
    const courseSlug = String(req.params.courseSlug || '').trim();
    if (!courseSlug) {
      return res.status(400).json({ message: 'Course slug is required.' });
    }

    const note = await CourseNote.findOne({
      user_id: req.user._id,
      course_slug: courseSlug
    }).lean();

    res.json({
      note: note ? {
        id: note._id,
        courseSlug: note.course_slug,
        content: note.content || '',
        updatedAt: note.updatedAt
      } : null
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Save text notes for a course
router.put('/notes/course/:courseSlug', async (req, res) => {
  try {
    const courseSlug = String(req.params.courseSlug || '').trim();
    if (!courseSlug) {
      return res.status(400).json({ message: 'Course slug is required.' });
    }

    const content = String(req.body?.content || '');

    const note = await CourseNote.findOneAndUpdate(
      {
        user_id: req.user._id,
        course_slug: courseSlug
      },
      {
        $set: { content }
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true
      }
    ).lean();

    res.json({
      note: {
        id: note._id,
        courseSlug: note.course_slug,
        content: note.content || '',
        updatedAt: note.updatedAt
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
