const mongoose = require('mongoose');
const Course = require('../models/Course');
const Module = require('../models/Module');
const Lesson = require('../models/Lesson');
const { getSlidesForLanguage } = require('./slideCatalog');
const { buildCourseContentFromSlides } = require('./courseContentBuilder');

const toCourseRecord = async (value) => {
  if (value && value._id && value.slug) {
    return value;
  }

  const input = String(value || '').trim();
  if (!input) {
    return null;
  }

  if (mongoose.Types.ObjectId.isValid(input)) {
    const byId = await Course.findById(input);
    if (byId) {
      return byId;
    }
  }

  return Course.findOne({ slug: input });
};

const refreshModuleStats = async (moduleId) => {
  const lessons = await Lesson.find({
    module_id: moduleId,
    is_published: true
  })
    .select('estimated_duration_minutes')
    .lean();

  const lessonCount = lessons.length;
  const estimatedMinutes = lessons.reduce(
    (total, lesson) => total + (lesson.estimated_duration_minutes || 0),
    0
  );

  await Module.findByIdAndUpdate(moduleId, {
    $set: {
      lesson_count: lessonCount,
      estimated_minutes: estimatedMinutes
    }
  });
};

const syncCourseContent = async (courseInput, options = {}) => {
  const course = await toCourseRecord(courseInput);
  if (!course) {
    throw new Error('Course not found for content sync.');
  }

  const cleanupStale = options.cleanupStale !== false;
  const slides = getSlidesForLanguage(course.slug);
  const content = buildCourseContentFromSlides(slides);

  const syncedModuleIds = [];
  const syncedLessonIds = [];

  for (const moduleEntry of content.modules) {
    const moduleRecord = await Module.findOneAndUpdate(
      {
        course_id: course._id,
        slug: moduleEntry.slug
      },
      {
        $set: {
          course_id: course._id,
          source_module_id: moduleEntry.source_module_id,
          title: moduleEntry.title,
          slug: moduleEntry.slug,
          description: moduleEntry.description || '',
          order_index: moduleEntry.order_index,
          lesson_count: moduleEntry.lesson_count,
          estimated_minutes: moduleEntry.estimated_minutes,
          is_published: true
        }
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true
      }
    );

    syncedModuleIds.push(moduleRecord._id);

    for (const lessonEntry of moduleEntry.lessons) {
      const lessonRecord = await Lesson.findOneAndUpdate(
        {
          module_id: moduleRecord._id,
          slug: lessonEntry.slug
        },
        {
          $set: {
            course_id: course._id,
            module_id: moduleRecord._id,
            source_slide_id: lessonEntry.source_slide_id,
            source_module_id: lessonEntry.source_module_id,
            title: lessonEntry.title,
            slug: lessonEntry.slug,
            lesson_type: lessonEntry.lesson_type,
            summary: lessonEntry.summary,
            order_index: lessonEntry.order_index,
            estimated_duration_minutes:
              lessonEntry.estimated_duration_minutes,
            slide_count: lessonEntry.slide_count,
            content: lessonEntry.content,
            is_published: true
          }
        },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true
        }
      );

      syncedLessonIds.push(lessonRecord._id);
    }

    await refreshModuleStats(moduleRecord._id);
  }

  if (cleanupStale) {
    const staleLessonFilter = { course_id: course._id };
    if (syncedLessonIds.length > 0) {
      staleLessonFilter._id = { $nin: syncedLessonIds };
    }
    await Lesson.updateMany(staleLessonFilter, {
      $set: { is_published: false }
    });

    const staleModuleFilter = { course_id: course._id };
    if (syncedModuleIds.length > 0) {
      staleModuleFilter._id = { $nin: syncedModuleIds };
    }
    await Module.updateMany(staleModuleFilter, {
      $set: { is_published: false }
    });
  }

  return {
    courseId: String(course._id),
    courseSlug: course.slug,
    moduleCount: content.moduleCount,
    lessonCount: content.lessonCount
  };
};

const syncAllCourseContent = async (courseFilter = {}) => {
  const courses = await Course.find(courseFilter).sort({ sort_order: 1, created_at: -1 });
  const results = [];

  for (const course of courses) {
    const summary = await syncCourseContent(course);
    results.push(summary);
  }

  return results;
};

module.exports = {
  refreshModuleStats,
  syncCourseContent,
  syncAllCourseContent
};
