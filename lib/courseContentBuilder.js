const slugify = (value) =>
  String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

const extractSummary = (slide = {}) => {
  const content = slide.content || {};

  if (typeof content.subtitle === 'string' && content.subtitle.trim()) {
    return content.subtitle.trim();
  }

  if (typeof content.intro === 'string' && content.intro.trim()) {
    return content.intro.trim();
  }

  if (typeof content.description === 'string' && content.description.trim()) {
    return content.description.trim();
  }

  if (Array.isArray(content.bullets) && content.bullets[0]) {
    return String(content.bullets[0]).trim();
  }

  if (Array.isArray(content.items) && content.items[0]) {
    return String(content.items[0]).trim();
  }

  if (content.left?.title) {
    return String(content.left.title).trim();
  }

  if (content.right?.title) {
    return String(content.right.title).trim();
  }

  return '';
};

const normalizeSlides = (slides = []) =>
  (Array.isArray(slides) ? slides : [])
    .slice()
    .sort((a, b) => {
      const moduleDiff = Number(a?.moduleId || 0) - Number(b?.moduleId || 0);
      if (moduleDiff !== 0) {
        return moduleDiff;
      }
      return Number(a?.id || 0) - Number(b?.id || 0);
    });

const buildCourseContentFromSlides = (slides = []) => {
  const orderedSlides = normalizeSlides(slides);
  const moduleMap = new Map();

  orderedSlides.forEach((slide) => {
    const sourceModuleId = Number(slide?.moduleId || 0) || 1;
    const moduleTitle = String(slide?.moduleTitle || `Module ${sourceModuleId}`).trim();
    const moduleKey = `${sourceModuleId}:${moduleTitle}`;

    if (!moduleMap.has(moduleKey)) {
      moduleMap.set(moduleKey, {
        source_module_id: sourceModuleId,
        title: moduleTitle,
        slug: `module-${sourceModuleId}-${slugify(moduleTitle) || sourceModuleId}`,
        description: '',
        order_index: sourceModuleId,
        estimated_minutes: 0,
        lesson_count: 0,
        lessons: []
      });
    }

    const moduleEntry = moduleMap.get(moduleKey);
    const slideId = Number(slide?.id || moduleEntry.lessons.length + 1);
    const lessonTitle = String(slide?.title || `Lesson ${slideId}`).trim();
    const summary = extractSummary(slide);

    moduleEntry.lessons.push({
      source_slide_id: slideId,
      source_module_id: sourceModuleId,
      title: lessonTitle,
      slug: `${slugify(lessonTitle) || 'lesson'}-${slideId}`,
      lesson_type: String(slide?.type || 'slide').trim() || 'slide',
      summary,
      order_index: moduleEntry.lessons.length + 1,
      estimated_duration_minutes: 5,
      slide_count: 1,
      content: slide,
      is_published: true
    });
  });

  const modules = Array.from(moduleMap.values())
    .sort((a, b) => a.order_index - b.order_index)
    .map((moduleEntry) => {
      const lessons = moduleEntry.lessons;
      return {
        ...moduleEntry,
        lesson_count: lessons.length,
        estimated_minutes: lessons.reduce(
          (total, lesson) => total + (lesson.estimated_duration_minutes || 0),
          0
        ),
        lessons
      };
    });

  return {
    moduleCount: modules.length,
    lessonCount: modules.reduce(
      (total, moduleEntry) => total + (moduleEntry.lesson_count || 0),
      0
    ),
    modules
  };
};

module.exports = {
  buildCourseContentFromSlides,
  slugify
};
