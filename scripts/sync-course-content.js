const mongoose = require('mongoose');
require('dotenv').config();
const { syncAllCourseContent, syncCourseContent } = require('../lib/courseContentSync');

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = {
    course: '',
    all: false
  };

  args.forEach((arg) => {
    if (arg === '--all') {
      options.all = true;
      return;
    }

    if (arg.startsWith('--course=')) {
      options.course = arg.slice('--course='.length).trim();
    }
  });

  return options;
};

const run = async () => {
  const mongoUri =
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    'mongodb://localhost:27017/cohort-school';

  const { course, all } = parseArgs();
  await mongoose.connect(mongoUri);

  try {
    const results = all || !course
      ? await syncAllCourseContent()
      : [await syncCourseContent(course)];

    console.log(JSON.stringify({ synced: results }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
};

run().catch((error) => {
  console.error('Course content sync failed:', error);
  process.exit(1);
});
