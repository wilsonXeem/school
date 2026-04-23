const express = require('express');
const Course = require('../models/Course');
const Cohort = require('../models/Cohort');
const Module = require('../models/Module');
const Lesson = require('../models/Lesson');
const { optionalAuth } = require('../middleware/auth');
const { getSlidesForLanguage } = require('../lib/slideCatalog');
const { buildCourseContentFromSlides } = require('../lib/courseContentBuilder');

const router = express.Router();

const categoryLabel = (category) => {
  if (category === 'basic' || category === 'Basic Skills') {
    return 'Basic Skills';
  }
  return 'Programming Languages';
};

const getPreviewAccess = ({ hasFullAccess, previewPercent, itemCount }) => {
  const safeTotal = Number(itemCount || 0);
  if (safeTotal <= 0) {
    return {
      previewPercent,
      totalItems: 0,
      accessibleItems: 0,
      isPreviewMode: !hasFullAccess,
      hasFullAccess
    };
  }

  return {
    previewPercent,
    totalItems: safeTotal,
    accessibleItems: hasFullAccess
      ? safeTotal
      : Math.max(1, Math.ceil((previewPercent / 100) * safeTotal)),
    isPreviewMode: !hasFullAccess,
    hasFullAccess
  };
};

const mapCourseForClient = ({
  course,
  nextCohort,
  hasFullAccess,
  moduleCount = 0,
  lessonCount = 0
}) => {
  const previewPercent = course.preview_percent || 20;
  return {
    _id: course._id,
    id: course.slug,
    slug: course.slug,
    name: course.title,
    title: course.title,
    description: course.description,
    category: categoryLabel(course.category),
    level: course.level || 'Beginner',
    duration: `${course.duration_weeks || 12} weeks`,
    durationWeeks: course.duration_weeks || 12,
    objectives: course.objectives || [],
    outline: course.outline || [],
    color: course.color || '#0b5ed7',
    iconKey: course.icon_key || course.slug,
    nextCohortStartDate: nextCohort?.start_date || null,
    moduleCount,
    lessonCount,
    access: {
      previewPercent,
      fullAccessRequiresAuth: true,
      hasFullAccess: Boolean(hasFullAccess)
    },
    payment: {
      learning: 'free',
      certification: 'paid',
      cohortTraining: 'paid'
    }
  };
};

const mapLessonSummary = ({ lesson, flatIndex, accessibleItems }) => ({
  id: lesson._id || lesson.id || null,
  title: lesson.title,
  slug: lesson.slug,
  summary: lesson.summary || '',
  lessonType: lesson.lesson_type || 'slide',
  orderIndex: lesson.order_index || flatIndex,
  estimatedDurationMinutes: lesson.estimated_duration_minutes || 5,
  slideCount: lesson.slide_count || 1,
  sourceSlideId: lesson.source_slide_id || null,
  isLocked: flatIndex > accessibleItems,
  lessonNumber: flatIndex
});

const buildGeneratedCourseContent = (course) => {
  const generated = buildCourseContentFromSlides(getSlidesForLanguage(course.slug));
  const modules = generated.modules.map((moduleEntry, moduleIndex) => ({
    id: `generated-module-${course.slug}-${moduleIndex + 1}`,
    ...moduleEntry,
    lessons: moduleEntry.lessons.map((lessonEntry, lessonIndex) => ({
      id: `generated-lesson-${course.slug}-${moduleIndex + 1}-${lessonIndex + 1}`,
      ...lessonEntry
    }))
  }));

  return {
    source: 'generated',
    moduleCount: generated.moduleCount,
    lessonCount: generated.lessonCount,
    modules
  };
};

const loadCourseContent = async (course) => {
  const modules = await Module.find({
    course_id: course._id,
    is_published: true
  })
    .sort({ order_index: 1, createdAt: 1 })
    .lean();

  if (modules.length === 0) {
    return buildGeneratedCourseContent(course);
  }

  const lessons = await Lesson.find({
    course_id: course._id,
    is_published: true
  })
    .sort({ source_module_id: 1, order_index: 1, createdAt: 1 })
    .lean();

  if (lessons.length === 0) {
    return buildGeneratedCourseContent(course);
  }

  const lessonsByModuleId = new Map();
  lessons.forEach((lesson) => {
    const key = String(lesson.module_id);
    const entries = lessonsByModuleId.get(key) || [];
    entries.push(lesson);
    lessonsByModuleId.set(key, entries);
  });

  return {
    source: 'database',
    moduleCount: modules.length,
    lessonCount: lessons.length,
    modules: modules.map((moduleEntry) => ({
      id: moduleEntry._id,
      ...moduleEntry,
      lessons: lessonsByModuleId.get(String(moduleEntry._id)) || []
    }))
  };
};

const flattenCourseLessons = (content) => {
  let flatIndex = 0;
  const flattened = [];

  content.modules.forEach((moduleEntry) => {
    (moduleEntry.lessons || []).forEach((lesson) => {
      flatIndex += 1;
      flattened.push({
        module: moduleEntry,
        lesson,
        flatIndex
      });
    });
  });

  return flattened;
};

const findNextCohort = (courseId) =>
  Cohort.findOne({
    course_id: courseId,
    start_date: { $gte: new Date() }
  }).sort({ start_date: 1 });

// Get all published courses (guest preview policy included)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const hasFullAccess = Boolean(req.user);
    const courses = await Course.find({ is_published: true }).sort({
      sort_order: 1,
      created_at: -1
    });

    const coursesWithCohorts = await Promise.all(
      courses.map(async (course) => {
        const nextCohort = await findNextCohort(course._id);
        return mapCourseForClient({ course, nextCohort, hasFullAccess });
      })
    );

    res.json(coursesWithCohorts);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Existing slide-based endpoint used by the current frontend
router.get('/slug/:slug/slides', optionalAuth, async (req, res) => {
  try {
    const hasFullAccess = Boolean(req.user);
    const course = await Course.findOne({
      slug: req.params.slug,
      is_published: true
    });

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const allSlides = getSlidesForLanguage(course.slug);
    const previewPercent = course.preview_percent || 20;
    const access = getPreviewAccess({
      hasFullAccess,
      previewPercent,
      itemCount: allSlides.length
    });

    const nextCohort = await findNextCohort(course._id);

    res.json({
      course: mapCourseForClient({
        course,
        nextCohort,
        hasFullAccess,
        lessonCount: access.totalItems
      }),
      slides: allSlides.slice(0, access.accessibleItems),
      access: {
        isPreviewMode: access.isPreviewMode,
        hasFullAccess,
        previewPercent,
        totalSlides: access.totalItems,
        accessibleSlides: access.accessibleItems
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// New LMS content outline endpoint
router.get('/slug/:slug/content', optionalAuth, async (req, res) => {
  try {
    const hasFullAccess = Boolean(req.user);
    const course = await Course.findOne({
      slug: req.params.slug,
      is_published: true
    });

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const content = await loadCourseContent(course);
    const previewPercent = course.preview_percent || 20;
    const access = getPreviewAccess({
      hasFullAccess,
      previewPercent,
      itemCount: content.lessonCount
    });
    const flatLessons = flattenCourseLessons(content);
    const nextCohort = await findNextCohort(course._id);

    let currentIndex = 0;
    const modules = content.modules.map((moduleEntry) => ({
      id: moduleEntry._id || moduleEntry.id,
      title: moduleEntry.title,
      slug: moduleEntry.slug,
      description: moduleEntry.description || '',
      orderIndex: moduleEntry.order_index,
      lessonCount: moduleEntry.lesson_count || (moduleEntry.lessons || []).length,
      estimatedMinutes: moduleEntry.estimated_minutes || 0,
      lessons: (moduleEntry.lessons || []).map((lesson) => {
        currentIndex += 1;
        return mapLessonSummary({
          lesson,
          flatIndex: currentIndex,
          accessibleItems: access.accessibleItems
        });
      })
    }));

    res.json({
      course: mapCourseForClient({
        course,
        nextCohort,
        hasFullAccess,
        moduleCount: content.moduleCount,
        lessonCount: flatLessons.length
      }),
      modules,
      access: {
        isPreviewMode: access.isPreviewMode,
        hasFullAccess,
        previewPercent,
        totalLessons: access.totalItems,
        accessibleLessons: access.accessibleItems
      },
      contentSource: content.source
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// New LMS lesson detail endpoint
router.get('/slug/:slug/lessons/:lessonSlug', optionalAuth, async (req, res) => {
  try {
    const hasFullAccess = Boolean(req.user);
    const course = await Course.findOne({
      slug: req.params.slug,
      is_published: true
    });

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const content = await loadCourseContent(course);
    const previewPercent = course.preview_percent || 20;
    const access = getPreviewAccess({
      hasFullAccess,
      previewPercent,
      itemCount: content.lessonCount
    });
    const flatLessons = flattenCourseLessons(content);
    const lessonEntry = flatLessons.find(
      (entry) => entry.lesson.slug === req.params.lessonSlug
    );

    if (!lessonEntry) {
      return res.status(404).json({ message: 'Lesson not found' });
    }

    if (lessonEntry.flatIndex > access.accessibleItems) {
      return res.status(403).json({
        message: 'This lesson is locked in preview mode.',
        access: {
          isPreviewMode: access.isPreviewMode,
          hasFullAccess,
          previewPercent,
          totalLessons: access.totalItems,
          accessibleLessons: access.accessibleItems
        }
      });
    }

    const nextCohort = await findNextCohort(course._id);
    const previousLesson = flatLessons.find(
      (entry) => entry.flatIndex === lessonEntry.flatIndex - 1
    );
    const nextLesson = flatLessons.find(
      (entry) => entry.flatIndex === lessonEntry.flatIndex + 1
    );

    res.json({
      course: mapCourseForClient({
        course,
        nextCohort,
        hasFullAccess,
        moduleCount: content.moduleCount,
        lessonCount: flatLessons.length
      }),
      module: {
        id: lessonEntry.module._id || lessonEntry.module.id,
        title: lessonEntry.module.title,
        slug: lessonEntry.module.slug,
        orderIndex: lessonEntry.module.order_index
      },
      lesson: {
        id: lessonEntry.lesson._id || lessonEntry.lesson.id,
        title: lessonEntry.lesson.title,
        slug: lessonEntry.lesson.slug,
        lessonType: lessonEntry.lesson.lesson_type || 'slide',
        summary: lessonEntry.lesson.summary || '',
        orderIndex: lessonEntry.lesson.order_index,
        lessonNumber: lessonEntry.flatIndex,
        estimatedDurationMinutes:
          lessonEntry.lesson.estimated_duration_minutes || 5,
        sourceSlideId: lessonEntry.lesson.source_slide_id || null,
        content: lessonEntry.lesson.content || {}
      },
      navigation: {
        previousLessonSlug: previousLesson?.lesson?.slug || null,
        nextLessonSlug:
          nextLesson && nextLesson.flatIndex <= access.accessibleItems
            ? nextLesson.lesson.slug
            : null
      },
      access: {
        isPreviewMode: access.isPreviewMode,
        hasFullAccess,
        previewPercent,
        totalLessons: access.totalItems,
        accessibleLessons: access.accessibleItems
      },
      contentSource: content.source
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get course by slug
router.get('/slug/:slug', optionalAuth, async (req, res) => {
  try {
    const hasFullAccess = Boolean(req.user);
    const course = await Course.findOne({
      slug: req.params.slug,
      is_published: true
    });

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const nextCohort = await findNextCohort(course._id);
    const content = await loadCourseContent(course);

    res.json(
      mapCourseForClient({
        course,
        nextCohort,
        hasFullAccess,
        moduleCount: content.moduleCount,
        lessonCount: content.lessonCount
      })
    );
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get course by ID
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const hasFullAccess = Boolean(req.user);
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const upcomingCohorts = await Cohort.find({
      course_id: course._id,
      start_date: { $gte: new Date() }
    })
      .sort({ start_date: 1 })
      .limit(3);
    const content = await loadCourseContent(course);

    res.json({
      ...mapCourseForClient({
        course,
        nextCohort: upcomingCohorts[0],
        hasFullAccess,
        moduleCount: content.moduleCount,
        lessonCount: content.lessonCount
      }),
      upcomingCohorts
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
