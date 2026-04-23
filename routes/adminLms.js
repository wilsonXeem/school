const express = require('express');
const mongoose = require('mongoose');
const Course = require('../models/Course');
const Cohort = require('../models/Cohort');
const Module = require('../models/Module');
const Lesson = require('../models/Lesson');
const Assessment = require('../models/Assessment');
const Submission = require('../models/Submission');
const LessonProgress = require('../models/LessonProgress');
const WhiteboardNote = require('../models/WhiteboardNote');
const { Announcement, Material } = require('../models');
const { createNotification } = require('../lib/notifications');
const {
  syncCourseContent,
  refreshModuleStats
} = require('../lib/courseContentSync');
const { auth, adminAuth } = require('../middleware/auth');

const router = express.Router();

router.use(auth);
router.use(adminAuth);

const MATERIAL_TYPES = new Set(['pdf', 'link']);
const SUBMISSION_STATUSES = new Set(['draft', 'submitted', 'graded', 'returned']);

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);

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

const clampNumber = ({ value, fallback, min, max }) => {
  const next = Number(value);
  if (Number.isNaN(next)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, next));
};

const toObjectIdOrNull = (value) => {
  const stringValue = String(value || '').trim();
  if (!stringValue || !mongoose.Types.ObjectId.isValid(stringValue)) {
    return null;
  }
  return new mongoose.Types.ObjectId(stringValue);
};

const handleRouteError = (res, error, fallback = 'Server error') => {
  if (error?.code === 11000) {
    return res.status(409).json({
      message: 'A record with the same unique field already exists.',
      error: error.message
    });
  }

  return res.status(500).json({
    message: fallback,
    error: error.message
  });
};

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

const getNextModuleOrderIndex = async (courseId) => {
  const lastModule = await Module.findOne({ course_id: courseId })
    .sort({ order_index: -1, createdAt: -1 })
    .select('order_index')
    .lean();

  return (lastModule?.order_index || 0) + 1;
};

const getNextLessonOrderIndex = async (moduleId) => {
  const lastLesson = await Lesson.findOne({ module_id: moduleId })
    .sort({ order_index: -1, createdAt: -1 })
    .select('order_index')
    .lean();

  return (lastLesson?.order_index || 0) + 1;
};

const mapAdminModule = (module) => ({
  id: normalizeId(module._id),
  courseId: normalizeId(module.course_id),
  title: module.title,
  slug: module.slug,
  description: module.description || '',
  orderIndex: module.order_index || 1,
  lessonCount: module.lesson_count || 0,
  estimatedMinutes: module.estimated_minutes || 0,
  isPublished: Boolean(module.is_published),
  createdAt: module.createdAt,
  updatedAt: module.updatedAt
});

const mapAdminLesson = (lesson) => ({
  id: normalizeId(lesson._id),
  courseId: normalizeId(lesson.course_id),
  moduleId: normalizeId(lesson.module_id),
  title: lesson.title,
  slug: lesson.slug,
  lessonType: lesson.lesson_type || 'slide',
  summary: lesson.summary || '',
  orderIndex: lesson.order_index || 1,
  estimatedDurationMinutes: lesson.estimated_duration_minutes || 5,
  slideCount: lesson.slide_count || 1,
  content: lesson.content || {},
  isPublished: Boolean(lesson.is_published),
  createdAt: lesson.createdAt,
  updatedAt: lesson.updatedAt
});

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
  student: submission.user_id && submission.user_id.name
    ? {
        id: normalizeId(submission.user_id),
        name: submission.user_id.name,
        email: submission.user_id.email
      }
    : null,
  assessment: submission.assessment_id && submission.assessment_id.title
    ? {
        id: normalizeId(submission.assessment_id),
        title: submission.assessment_id.title,
        slug: submission.assessment_id.slug
      }
    : null
});

const mapAnnouncement = (announcement) => ({
  id: normalizeId(announcement._id),
  cohortId: normalizeId(announcement.cohort_id),
  message: announcement.message,
  createdAt: announcement.created_at || announcement.createdAt || null,
  updatedAt:
    announcement.updated_at ||
    announcement.updatedAt ||
    announcement.created_at ||
    announcement.createdAt ||
    null,
  cohort: announcement.cohort_id && announcement.cohort_id.name
    ? {
        id: normalizeId(announcement.cohort_id),
        name: announcement.cohort_id.name,
        course: announcement.cohort_id.course_id
          ? {
              id: normalizeId(announcement.cohort_id.course_id),
              title: announcement.cohort_id.course_id.title,
              slug: announcement.cohort_id.course_id.slug
            }
          : null
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
    null,
  course: material.course_id && material.course_id.title
    ? {
        id: normalizeId(material.course_id),
        title: material.course_id.title,
        slug: material.course_id.slug
      }
    : null
});

const normalizeModulePayload = (body = {}, isPatch = false) => {
  const payload = {};

  if (!isPatch || hasOwn(body, 'title')) {
    payload.title = String(body.title || '').trim();
  }

  if (!isPatch || hasOwn(body, 'slug')) {
    payload.slug = String(body.slug || '').trim() || slugify(body.title || '');
  }

  if (!isPatch || hasOwn(body, 'description')) {
    payload.description = String(body.description || '').trim();
  }

  if (!isPatch || hasOwn(body, 'orderIndex') || hasOwn(body, 'order_index')) {
    payload.order_index = clampNumber({
      value: body.orderIndex ?? body.order_index,
      fallback: 1,
      min: 1,
      max: 10000
    });
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

const normalizeLessonPayload = (body = {}, isPatch = false) => {
  const payload = {};

  if (!isPatch || hasOwn(body, 'title')) {
    payload.title = String(body.title || '').trim();
  }

  if (!isPatch || hasOwn(body, 'slug')) {
    payload.slug = String(body.slug || '').trim() || slugify(body.title || '');
  }

  if (!isPatch || hasOwn(body, 'lessonType') || hasOwn(body, 'lesson_type')) {
    payload.lesson_type = String(
      body.lessonType || body.lesson_type || 'slide'
    ).trim() || 'slide';
  }

  if (!isPatch || hasOwn(body, 'summary')) {
    payload.summary = String(body.summary || '').trim();
  }

  if (!isPatch || hasOwn(body, 'orderIndex') || hasOwn(body, 'order_index')) {
    payload.order_index = clampNumber({
      value: body.orderIndex ?? body.order_index,
      fallback: 1,
      min: 1,
      max: 10000
    });
  }

  if (
    !isPatch ||
    hasOwn(body, 'estimatedDurationMinutes') ||
    hasOwn(body, 'estimated_duration_minutes')
  ) {
    payload.estimated_duration_minutes = clampNumber({
      value:
        body.estimatedDurationMinutes ?? body.estimated_duration_minutes,
      fallback: 5,
      min: 1,
      max: 720
    });
  }

  if (!isPatch || hasOwn(body, 'slideCount') || hasOwn(body, 'slide_count')) {
    payload.slide_count = clampNumber({
      value: body.slideCount ?? body.slide_count,
      fallback: 1,
      min: 1,
      max: 1000
    });
  }

  if (!isPatch || hasOwn(body, 'content')) {
    payload.content =
      body.content && typeof body.content === 'object' ? body.content : {};
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

const normalizeAssessmentPayload = (body = {}, isPatch = false) => {
  const payload = {};

  if (
    !isPatch ||
    hasOwn(body, 'moduleId') ||
    hasOwn(body, 'module_id')
  ) {
    payload.module_id =
      toObjectIdOrNull(body.moduleId ?? body.module_id) || null;
  }

  if (
    !isPatch ||
    hasOwn(body, 'lessonId') ||
    hasOwn(body, 'lesson_id')
  ) {
    payload.lesson_id =
      toObjectIdOrNull(body.lessonId ?? body.lesson_id) || null;
  }

  if (!isPatch || hasOwn(body, 'title')) {
    payload.title = String(body.title || '').trim();
  }

  if (!isPatch || hasOwn(body, 'slug')) {
    payload.slug = String(body.slug || '').trim() || slugify(body.title || '');
  }

  if (!isPatch || hasOwn(body, 'type')) {
    const type = String(body.type || 'quiz').trim().toLowerCase();
    payload.type = type === 'assignment' ? 'assignment' : 'quiz';
  }

  if (!isPatch || hasOwn(body, 'instructions')) {
    payload.instructions = String(body.instructions || '').trim();
  }

  if (!isPatch || hasOwn(body, 'questions')) {
    payload.questions = Array.isArray(body.questions) ? body.questions : [];
  }

  if (!isPatch || hasOwn(body, 'passScore') || hasOwn(body, 'pass_score')) {
    payload.pass_score = clampNumber({
      value: body.passScore ?? body.pass_score,
      fallback: 70,
      min: 0,
      max: 100
    });
  }

  if (!isPatch || hasOwn(body, 'maxAttempts') || hasOwn(body, 'max_attempts')) {
    payload.max_attempts = clampNumber({
      value: body.maxAttempts ?? body.max_attempts,
      fallback: 3,
      min: 1,
      max: 20
    });
  }

  if (!isPatch || hasOwn(body, 'isPublished') || hasOwn(body, 'is_published')) {
    if (typeof body.isPublished === 'boolean') {
      payload.is_published = body.isPublished;
    } else if (typeof body.is_published === 'boolean') {
      payload.is_published = body.is_published;
    } else if (!isPatch) {
      payload.is_published = false;
    }
  }

  return payload;
};

const assertAssessmentOwnership = async ({ courseId, moduleId, lessonId }) => {
  let module = null;
  let lesson = null;

  if (moduleId) {
    module = await Module.findById(moduleId).select('_id course_id').lean();
    if (!module || String(module.course_id) !== String(courseId)) {
      throw new Error('Selected module does not belong to this course.');
    }
  }

  if (lessonId) {
    lesson = await Lesson.findById(lessonId)
      .select('_id course_id module_id')
      .lean();
    if (!lesson || String(lesson.course_id) !== String(courseId)) {
      throw new Error('Selected lesson does not belong to this course.');
    }
    if (moduleId && String(lesson.module_id) !== String(moduleId)) {
      throw new Error('Selected lesson does not belong to the selected module.');
    }
  }

  return { module, lesson };
};

const deleteAssessmentsByFilter = async (filter) => {
  const assessments = await Assessment.find(filter).select('_id').lean();
  const assessmentIds = assessments.map((entry) => entry._id);

  if (assessmentIds.length > 0) {
    await Submission.deleteMany({ assessment_id: { $in: assessmentIds } });
    await Assessment.deleteMany({ _id: { $in: assessmentIds } });
  }
};

const deleteLessonCascade = async (lesson) => {
  await deleteAssessmentsByFilter({ lesson_id: lesson._id });
  await LessonProgress.deleteMany({ lesson_id: lesson._id });
  await WhiteboardNote.deleteMany({ lesson_id: lesson._id });
  await Lesson.deleteOne({ _id: lesson._id });
  await refreshModuleStats(lesson.module_id);
};

const deleteModuleCascade = async (moduleEntry) => {
  const lessons = await Lesson.find({ module_id: moduleEntry._id })
    .select('_id module_id')
    .lean();
  const lessonIds = lessons.map((entry) => entry._id);

  if (lessonIds.length > 0) {
    await deleteAssessmentsByFilter({
      $or: [{ module_id: moduleEntry._id }, { lesson_id: { $in: lessonIds } }]
    });
    await LessonProgress.deleteMany({ lesson_id: { $in: lessonIds } });
    await WhiteboardNote.deleteMany({ lesson_id: { $in: lessonIds } });
    await Lesson.deleteMany({ _id: { $in: lessonIds } });
  } else {
    await deleteAssessmentsByFilter({ module_id: moduleEntry._id });
  }

  await Module.deleteOne({ _id: moduleEntry._id });
};

router.post('/courses/:courseId/sync-content', async (req, res) => {
  try {
    const summary = await syncCourseContent(req.params.courseId, {
      cleanupStale: req.body?.cleanupStale !== false
    });

    res.json({
      message: 'Course content synced successfully.',
      summary
    });
  } catch (error) {
    if (error.message === 'Course not found for content sync.') {
      return res.status(404).json({ message: error.message });
    }
    return handleRouteError(res, error, 'Unable to sync course content.');
  }
});

router.get('/courses/:courseId/modules', async (req, res) => {
  try {
    const course = await resolveCourse(req.params.courseId);
    if (!course) {
      return res.status(404).json({ message: 'Course not found.' });
    }

    const modules = await Module.find({ course_id: course._id })
      .sort({ order_index: 1, createdAt: 1 })
      .lean();

    res.json({
      modules: modules.map(mapAdminModule)
    });
  } catch (error) {
    return handleRouteError(res, error);
  }
});

router.post('/courses/:courseId/modules', async (req, res) => {
  try {
    const course = await resolveCourse(req.params.courseId);
    if (!course) {
      return res.status(404).json({ message: 'Course not found.' });
    }

    const payload = normalizeModulePayload(req.body);
    if (!payload.title || !payload.slug) {
      return res.status(400).json({
        message: 'title and slug are required for a module.'
      });
    }

    if (!hasOwn(req.body, 'orderIndex') && !hasOwn(req.body, 'order_index')) {
      payload.order_index = await getNextModuleOrderIndex(course._id);
    }

    const moduleEntry = await Module.create({
      course_id: course._id,
      source_module_id: null,
      title: payload.title,
      slug: payload.slug,
      description: payload.description,
      order_index: payload.order_index,
      is_published: payload.is_published
    });

    res.status(201).json({
      module: mapAdminModule(moduleEntry)
    });
  } catch (error) {
    return handleRouteError(res, error, 'Unable to create module.');
  }
});

router.patch('/modules/:moduleId', async (req, res) => {
  try {
    const moduleEntry = await Module.findById(req.params.moduleId);
    if (!moduleEntry) {
      return res.status(404).json({ message: 'Module not found.' });
    }

    const payload = normalizeModulePayload(req.body, true);
    if (hasOwn(payload, 'title') && !payload.title) {
      return res.status(400).json({ message: 'Module title cannot be empty.' });
    }
    if (hasOwn(payload, 'slug') && !payload.slug) {
      return res.status(400).json({ message: 'Module slug cannot be empty.' });
    }

    Object.assign(moduleEntry, payload);
    await moduleEntry.save();

    res.json({
      module: mapAdminModule(moduleEntry)
    });
  } catch (error) {
    return handleRouteError(res, error, 'Unable to update module.');
  }
});

router.delete('/modules/:moduleId', async (req, res) => {
  try {
    const moduleEntry = await Module.findById(req.params.moduleId)
      .select('_id course_id')
      .lean();

    if (!moduleEntry) {
      return res.status(404).json({ message: 'Module not found.' });
    }

    await deleteModuleCascade(moduleEntry);

    res.json({
      message: 'Module deleted successfully.'
    });
  } catch (error) {
    return handleRouteError(res, error, 'Unable to delete module.');
  }
});

router.get('/modules/:moduleId/lessons', async (req, res) => {
  try {
    const moduleEntry = await Module.findById(req.params.moduleId)
      .select('_id')
      .lean();

    if (!moduleEntry) {
      return res.status(404).json({ message: 'Module not found.' });
    }

    const lessons = await Lesson.find({ module_id: moduleEntry._id })
      .sort({ order_index: 1, createdAt: 1 })
      .lean();

    res.json({
      lessons: lessons.map(mapAdminLesson)
    });
  } catch (error) {
    return handleRouteError(res, error);
  }
});

router.post('/modules/:moduleId/lessons', async (req, res) => {
  try {
    const moduleEntry = await Module.findById(req.params.moduleId)
      .select('_id course_id source_module_id')
      .lean();

    if (!moduleEntry) {
      return res.status(404).json({ message: 'Module not found.' });
    }

    const payload = normalizeLessonPayload(req.body);
    if (!payload.title || !payload.slug) {
      return res.status(400).json({
        message: 'title and slug are required for a lesson.'
      });
    }

    if (!hasOwn(req.body, 'orderIndex') && !hasOwn(req.body, 'order_index')) {
      payload.order_index = await getNextLessonOrderIndex(moduleEntry._id);
    }

    const lesson = await Lesson.create({
      course_id: moduleEntry.course_id,
      module_id: moduleEntry._id,
      source_slide_id: null,
      source_module_id: moduleEntry.source_module_id || null,
      title: payload.title,
      slug: payload.slug,
      lesson_type: payload.lesson_type,
      summary: payload.summary,
      order_index: payload.order_index,
      estimated_duration_minutes: payload.estimated_duration_minutes,
      slide_count: payload.slide_count,
      content: payload.content,
      is_published: payload.is_published
    });

    await refreshModuleStats(moduleEntry._id);

    res.status(201).json({
      lesson: mapAdminLesson(lesson)
    });
  } catch (error) {
    return handleRouteError(res, error, 'Unable to create lesson.');
  }
});

router.get('/lessons/:lessonId', async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.lessonId).lean();
    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found.' });
    }

    res.json({
      lesson: mapAdminLesson(lesson)
    });
  } catch (error) {
    return handleRouteError(res, error);
  }
});

router.patch('/lessons/:lessonId', async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.lessonId);
    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found.' });
    }

    const payload = normalizeLessonPayload(req.body, true);
    if (hasOwn(payload, 'title') && !payload.title) {
      return res.status(400).json({ message: 'Lesson title cannot be empty.' });
    }
    if (hasOwn(payload, 'slug') && !payload.slug) {
      return res.status(400).json({ message: 'Lesson slug cannot be empty.' });
    }

    Object.assign(lesson, payload);
    await lesson.save();
    await refreshModuleStats(lesson.module_id);

    res.json({
      lesson: mapAdminLesson(lesson)
    });
  } catch (error) {
    return handleRouteError(res, error, 'Unable to update lesson.');
  }
});

router.delete('/lessons/:lessonId', async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.lessonId)
      .select('_id module_id')
      .lean();

    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found.' });
    }

    await deleteLessonCascade(lesson);

    res.json({
      message: 'Lesson deleted successfully.'
    });
  } catch (error) {
    return handleRouteError(res, error, 'Unable to delete lesson.');
  }
});

router.get('/courses/:courseId/assessments', async (req, res) => {
  try {
    const course = await resolveCourse(req.params.courseId);
    if (!course) {
      return res.status(404).json({ message: 'Course not found.' });
    }

    const assessments = await Assessment.find({ course_id: course._id })
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      assessments: assessments.map(mapAssessment)
    });
  } catch (error) {
    return handleRouteError(res, error);
  }
});

router.post('/courses/:courseId/assessments', async (req, res) => {
  try {
    const course = await resolveCourse(req.params.courseId);
    if (!course) {
      return res.status(404).json({ message: 'Course not found.' });
    }

    const payload = normalizeAssessmentPayload(req.body);
    if (!payload.title || !payload.slug) {
      return res.status(400).json({
        message: 'title and slug are required for an assessment.'
      });
    }

    await assertAssessmentOwnership({
      courseId: course._id,
      moduleId: payload.module_id,
      lessonId: payload.lesson_id
    });

    const assessment = await Assessment.create({
      course_id: course._id,
      module_id: payload.module_id,
      lesson_id: payload.lesson_id,
      title: payload.title,
      slug: payload.slug,
      type: payload.type,
      instructions: payload.instructions,
      questions: payload.questions,
      pass_score: payload.pass_score,
      max_attempts: payload.max_attempts,
      is_published: payload.is_published
    });

    res.status(201).json({
      assessment: mapAssessment(assessment)
    });
  } catch (error) {
    if (error.message.includes('does not belong')) {
      return res.status(400).json({ message: error.message });
    }
    return handleRouteError(res, error, 'Unable to create assessment.');
  }
});

router.patch('/assessments/:assessmentId', async (req, res) => {
  try {
    const assessment = await Assessment.findById(req.params.assessmentId);
    if (!assessment) {
      return res.status(404).json({ message: 'Assessment not found.' });
    }

    const payload = normalizeAssessmentPayload(req.body, true);
    if (hasOwn(payload, 'title') && !payload.title) {
      return res.status(400).json({
        message: 'Assessment title cannot be empty.'
      });
    }
    if (hasOwn(payload, 'slug') && !payload.slug) {
      return res.status(400).json({
        message: 'Assessment slug cannot be empty.'
      });
    }

    const nextModuleId = hasOwn(payload, 'module_id')
      ? payload.module_id
      : assessment.module_id;
    const nextLessonId = hasOwn(payload, 'lesson_id')
      ? payload.lesson_id
      : assessment.lesson_id;

    await assertAssessmentOwnership({
      courseId: assessment.course_id,
      moduleId: nextModuleId,
      lessonId: nextLessonId
    });

    Object.assign(assessment, payload);
    await assessment.save();

    res.json({
      assessment: mapAssessment(assessment)
    });
  } catch (error) {
    if (error.message.includes('does not belong')) {
      return res.status(400).json({ message: error.message });
    }
    return handleRouteError(res, error, 'Unable to update assessment.');
  }
});

router.delete('/assessments/:assessmentId', async (req, res) => {
  try {
    const assessment = await Assessment.findById(req.params.assessmentId)
      .select('_id')
      .lean();

    if (!assessment) {
      return res.status(404).json({ message: 'Assessment not found.' });
    }

    await Submission.deleteMany({ assessment_id: assessment._id });
    await Assessment.deleteOne({ _id: assessment._id });

    res.json({
      message: 'Assessment deleted successfully.'
    });
  } catch (error) {
    return handleRouteError(res, error, 'Unable to delete assessment.');
  }
});

router.get('/assessments/:assessmentId/submissions', async (req, res) => {
  try {
    const assessment = await Assessment.findById(req.params.assessmentId).lean();
    if (!assessment) {
      return res.status(404).json({ message: 'Assessment not found.' });
    }

    const submissions = await Submission.find({
      assessment_id: assessment._id
    })
      .populate('user_id', 'name email')
      .populate('assessment_id', 'title slug')
      .sort({ submitted_at: -1, createdAt: -1 })
      .lean();

    res.json({
      assessment: mapAssessment(assessment),
      submissions: submissions.map(mapSubmission)
    });
  } catch (error) {
    return handleRouteError(res, error);
  }
});

router.patch('/submissions/:submissionId', async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.submissionId)
      .populate('assessment_id')
      .populate('user_id', 'name email')
      .lean();

    if (!submission) {
      return res.status(404).json({ message: 'Submission not found.' });
    }

    const update = {};
    if (hasOwn(req.body, 'status')) {
      const status = String(req.body.status || '').trim().toLowerCase();
      if (!SUBMISSION_STATUSES.has(status)) {
        return res.status(400).json({ message: 'Invalid submission status.' });
      }
      update.status = status;
      if (status === 'graded' || status === 'returned') {
        update.reviewed_at = new Date();
      }
    }

    if (hasOwn(req.body, 'score')) {
      if (req.body.score === null || req.body.score === '') {
        update.score = null;
      } else {
        update.score = clampNumber({
          value: req.body.score,
          fallback: 0,
          min: 0,
          max: 100
        });
      }
    }

    if (hasOwn(req.body, 'feedback')) {
      update.feedback = String(req.body.feedback || '').trim();
    }

    update.reviewed_by = req.user._id;
    if (!update.reviewed_at) {
      update.reviewed_at = new Date();
    }

    const updated = await Submission.findByIdAndUpdate(
      submission._id,
      { $set: update },
      { new: true }
    )
      .populate('user_id', 'name email')
      .populate('assessment_id', 'title slug')
      .lean();

    if (updated?.user_id?._id) {
      await createNotification({
        userId: updated.user_id._id,
        type: 'system',
        title: 'Assessment reviewed',
        message: `${updated.assessment_id?.title || 'Your assessment'} has been reviewed.`,
        meta: {
          submissionId: normalizeId(updated._id),
          assessmentId: normalizeId(updated.assessment_id)
        }
      });
    }

    res.json({
      submission: mapSubmission(updated)
    });
  } catch (error) {
    return handleRouteError(res, error, 'Unable to grade submission.');
  }
});

router.get('/announcements', async (req, res) => {
  try {
    const filter = {};
    const cohortId = toObjectIdOrNull(req.query.cohortId || req.query.cohort_id);
    if (cohortId) {
      filter.cohort_id = cohortId;
    } else if (req.query.courseId || req.query.courseSlug) {
      const course = await resolveCourse(req.query.courseId || req.query.courseSlug);
      if (!course) {
        return res.status(404).json({ message: 'Course not found.' });
      }
      const cohorts = await Cohort.find({ course_id: course._id }).select('_id').lean();
      filter.cohort_id = { $in: cohorts.map((entry) => entry._id) };
    }

    const announcements = await Announcement.find(filter)
      .populate({
        path: 'cohort_id',
        select: 'name course_id',
        populate: {
          path: 'course_id',
          select: 'title slug'
        }
      })
      .sort({ created_at: -1 })
      .lean();

    res.json({
      announcements: announcements.map(mapAnnouncement)
    });
  } catch (error) {
    return handleRouteError(res, error);
  }
});

router.patch('/announcements/:announcementId', async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.announcementId);
    if (!announcement) {
      return res.status(404).json({ message: 'Announcement not found.' });
    }

    if (hasOwn(req.body, 'cohortId') || hasOwn(req.body, 'cohort_id')) {
      const cohortId = toObjectIdOrNull(req.body.cohortId || req.body.cohort_id);
      if (!cohortId) {
        return res.status(400).json({ message: 'A valid cohort is required.' });
      }

      const cohort = await Cohort.findById(cohortId).select('_id').lean();
      if (!cohort) {
        return res.status(404).json({ message: 'Cohort not found.' });
      }

      announcement.cohort_id = cohortId;
    }

    if (hasOwn(req.body, 'message')) {
      const message = String(req.body.message || '').trim();
      if (!message) {
        return res.status(400).json({
          message: 'Announcement message cannot be empty.'
        });
      }
      announcement.message = message;
    }

    announcement.updated_at = new Date();
    await announcement.save();

    const populated = await Announcement.findById(announcement._id)
      .populate({
        path: 'cohort_id',
        select: 'name course_id',
        populate: {
          path: 'course_id',
          select: 'title slug'
        }
      })
      .lean();

    res.json({
      announcement: mapAnnouncement(populated)
    });
  } catch (error) {
    return handleRouteError(res, error, 'Unable to update announcement.');
  }
});

router.delete('/announcements/:announcementId', async (req, res) => {
  try {
    const deleted = await Announcement.findByIdAndDelete(req.params.announcementId)
      .select('_id')
      .lean();

    if (!deleted) {
      return res.status(404).json({ message: 'Announcement not found.' });
    }

    res.json({
      message: 'Announcement deleted successfully.'
    });
  } catch (error) {
    return handleRouteError(res, error, 'Unable to delete announcement.');
  }
});

router.get('/materials', async (req, res) => {
  try {
    const filter = {};
    const course = await resolveCourse(req.query.courseId || req.query.courseSlug);
    if ((req.query.courseId || req.query.courseSlug) && !course) {
      return res.status(404).json({ message: 'Course not found.' });
    }
    if (course) {
      filter.course_id = course._id;
    }

    const materials = await Material.find(filter)
      .populate('course_id', 'title slug')
      .sort({ created_at: -1 })
      .lean();

    res.json({
      materials: materials.map(mapMaterial)
    });
  } catch (error) {
    return handleRouteError(res, error);
  }
});

router.patch('/materials/:materialId', async (req, res) => {
  try {
    const material = await Material.findById(req.params.materialId);
    if (!material) {
      return res.status(404).json({ message: 'Material not found.' });
    }

    if (hasOwn(req.body, 'courseId') || hasOwn(req.body, 'course_id')) {
      const courseId = toObjectIdOrNull(req.body.courseId || req.body.course_id);
      if (!courseId) {
        return res.status(400).json({ message: 'A valid course is required.' });
      }

      const course = await Course.findById(courseId).select('_id').lean();
      if (!course) {
        return res.status(404).json({ message: 'Course not found.' });
      }

      material.course_id = courseId;
    }

    if (hasOwn(req.body, 'title')) {
      const title = String(req.body.title || '').trim();
      if (!title) {
        return res.status(400).json({ message: 'Material title cannot be empty.' });
      }
      material.title = title;
    }

    if (hasOwn(req.body, 'type')) {
      const type = String(req.body.type || '').trim().toLowerCase();
      if (!MATERIAL_TYPES.has(type)) {
        return res.status(400).json({ message: 'Material type must be pdf or link.' });
      }
      material.type = type;
    }

    if (hasOwn(req.body, 'url')) {
      const url = String(req.body.url || '').trim();
      if (!url) {
        return res.status(400).json({ message: 'Material URL cannot be empty.' });
      }
      material.url = url;
    }

    material.updated_at = new Date();
    await material.save();

    const populated = await Material.findById(material._id)
      .populate('course_id', 'title slug')
      .lean();

    res.json({
      material: mapMaterial(populated)
    });
  } catch (error) {
    return handleRouteError(res, error, 'Unable to update material.');
  }
});

router.delete('/materials/:materialId', async (req, res) => {
  try {
    const deleted = await Material.findByIdAndDelete(req.params.materialId)
      .select('_id')
      .lean();

    if (!deleted) {
      return res.status(404).json({ message: 'Material not found.' });
    }

    res.json({
      message: 'Material deleted successfully.'
    });
  } catch (error) {
    return handleRouteError(res, error, 'Unable to delete material.');
  }
});

module.exports = router;
