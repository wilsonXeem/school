const mongoose = require('mongoose');
const Course = require('../models/Course');
const Cohort = require('../models/Cohort');
const { syncCourseContent } = require('../lib/courseContentSync');

const courses = [
  {
    title: 'Python Programming',
    slug: 'python',
    category: 'programming',
    level: 'Beginner',
    color: '#3776ab',
    icon_key: 'python',
    sort_order: 1,
    preview_percent: 20,
    description: 'Master Python fundamentals and advanced concepts. Build real-world applications with clean, efficient code.',
    objectives: [
      'Write clean Python programs with confidence',
      'Use data structures, functions, and OOP effectively',
      'Work with APIs, files, and external modules',
      'Debug, test, and ship Python projects'
    ],
    outline: [
      'Python syntax and variables',
      'Functions and scope',
      'Data structures and control flow',
      'Object oriented programming',
      'Files, modules, and packages',
      'Testing and debugging'
    ]
  },
  {
    title: 'JavaScript ES6+',
    slug: 'javascript',
    category: 'programming',
    level: 'Intermediate',
    color: '#f7df1e',
    icon_key: 'javascript',
    sort_order: 2,
    preview_percent: 20,
    description: 'Modern JavaScript development with ES6+ features. Build interactive web applications and master async programming.',
    objectives: [
      'Build interactive web experiences with modern JS',
      'Understand async patterns and browser APIs',
      'Structure code with modules and tooling',
      'Ship client-side projects with confidence'
    ],
    outline: [
      'ES6 syntax and fundamentals',
      'DOM manipulation and events',
      'Async JavaScript and fetch',
      'Modules and tooling',
      'Browser storage and state',
      'Patterns and best practices'
    ]
  },
  {
    title: 'HTML5 & Semantic Web',
    slug: 'html',
    category: 'programming',
    level: 'Beginner',
    color: '#e34f26',
    icon_key: 'html',
    sort_order: 3,
    preview_percent: 20,
    description: 'Build accessible, semantic web structures. Master modern HTML5 features and web standards.',
    objectives: [
      'Design accessible semantic page structures',
      'Build forms that work across devices',
      'Embed media and interactive elements',
      'Prepare markup for SEO and performance'
    ],
    outline: [
      'Semantic structure and layout',
      'Forms and validation',
      'Media and tables',
      'Accessibility basics',
      'SEO and metadata',
      'HTML5 APIs'
    ]
  },
  {
    title: 'CSS3 & Modern Styling',
    slug: 'css',
    category: 'programming',
    level: 'Intermediate',
    color: '#1572b6',
    icon_key: 'css',
    sort_order: 4,
    preview_percent: 20,
    description: 'Master modern CSS techniques. Create responsive layouts, animations, and maintainable design systems.',
    objectives: [
      'Create layout systems with Flexbox and Grid',
      'Build responsive mobile-first interfaces',
      'Animate UI with transitions and keyframes',
      'Establish reusable design systems'
    ],
    outline: [
      'Cascade and specificity',
      'Box model and positioning',
      'Flexbox layouts',
      'CSS Grid systems',
      'Responsive design',
      'Animations and theming'
    ]
  },
  {
    title: 'React Development',
    slug: 'react',
    category: 'programming',
    level: 'Advanced',
    color: '#61dafb',
    icon_key: 'react',
    sort_order: 5,
    preview_percent: 20,
    description: 'Build scalable React applications. Master components, hooks, state management, and modern development patterns.',
    objectives: [
      'Build reusable component libraries',
      'Manage state with hooks and context',
      'Integrate APIs and handle side effects',
      'Optimize and test React applications'
    ],
    outline: [
      'JSX and components',
      'State, props, and hooks',
      'Data fetching and effects',
      'Routing and navigation',
      'Context and state patterns',
      'Performance and testing'
    ]
  },
  {
    title: 'Node.js & Express',
    slug: 'nodejs',
    category: 'programming',
    level: 'Advanced',
    color: '#339933',
    icon_key: 'nodejs',
    sort_order: 6,
    preview_percent: 20,
    description: 'Build robust server-side applications. Master API development, database integration, and deployment strategies.',
    objectives: [
      'Design REST APIs with Express',
      'Connect databases and model data',
      'Implement authentication and middleware',
      'Deploy and maintain Node services'
    ],
    outline: [
      'Node runtime and modules',
      'Express routing and middleware',
      'REST APIs and controllers',
      'MongoDB integration',
      'Authentication with JWT',
      'Deployment and hosting'
    ]
  },
  {
    title: 'Data Structures & Algorithms',
    slug: 'dsa',
    category: 'programming',
    level: 'Advanced',
    color: '#ff6b6b',
    icon_key: 'dsa',
    sort_order: 7,
    preview_percent: 20,
    description: 'Master computer science fundamentals. Essential algorithms and data structures for technical interviews and efficient programming.',
    objectives: [
      'Analyze time and space complexity',
      'Implement core data structures',
      'Solve algorithmic challenges efficiently',
      'Prepare for technical interviews'
    ],
    outline: [
      'Big O and complexity',
      'Arrays and strings',
      'Stacks, queues, and linked lists',
      'Trees and graphs',
      'Sorting and searching',
      'Interview practice'
    ]
  },
  {
    title: 'Web Hosting & Deployment',
    slug: 'hosting',
    category: 'programming',
    level: 'Intermediate',
    color: '#00d4aa',
    icon_key: 'hosting',
    sort_order: 8,
    preview_percent: 20,
    description: 'Deploy and maintain web applications. Master hosting platforms, CI/CD pipelines, and performance optimization.',
    objectives: [
      'Understand hosting, DNS, and SSL',
      'Deploy full-stack apps reliably',
      'Automate CI/CD deployments',
      'Monitor uptime and performance'
    ],
    outline: [
      'Domains, DNS, and hosting basics',
      'Deploying static and backend apps',
      'SSL and security',
      'CI/CD automation',
      'Performance monitoring',
      'Release operations'
    ]
  },
  {
    title: 'Django Web Framework',
    slug: 'django',
    category: 'programming',
    level: 'Advanced',
    color: '#092e20',
    icon_key: 'django',
    sort_order: 9,
    preview_percent: 20,
    description: 'Build enterprise-grade web applications with Django. Master the MVT pattern, ORM, and production deployment.',
    objectives: [
      'Build Django apps with clean architecture',
      'Model data with the ORM',
      'Create secure authentication flows',
      'Deploy Django apps to production'
    ],
    outline: [
      'Django project structure',
      'Models and ORM',
      'Views, templates, and forms',
      'Authentication and permissions',
      'APIs with DRF',
      'Deployment and scaling'
    ]
  },
  {
    title: 'SQL Database Management',
    slug: 'sql',
    category: 'programming',
    level: 'Intermediate',
    color: '#336791',
    icon_key: 'sql',
    sort_order: 10,
    preview_percent: 20,
    description: 'Master database querying and management. Complex joins, performance optimization, and database design principles.',
    objectives: [
      'Query relational databases confidently',
      'Write joins and aggregations',
      'Optimize queries for performance',
      'Maintain data integrity and security'
    ],
    outline: [
      'SELECT queries and filtering',
      'Joins and relationships',
      'Aggregations and grouping',
      'Subqueries and CTEs',
      'Indexes and performance',
      'Transactions and integrity'
    ]
  },
  {
    title: 'MongoDB NoSQL Database',
    slug: 'mongodb',
    category: 'programming',
    level: 'Advanced',
    color: '#4db33d',
    icon_key: 'mongodb',
    sort_order: 11,
    preview_percent: 20,
    description: 'Master NoSQL database design and operations. Document modeling, aggregation pipelines, and scalable database architecture.',
    objectives: [
      'Model data for document databases',
      'Write efficient CRUD operations',
      'Use indexes and aggregation pipelines',
      'Manage backups and replication'
    ],
    outline: [
      'Document model and CRUD',
      'Schema design',
      'Indexing strategies',
      'Aggregation pipeline',
      'Replication and backups',
      'MongoDB Atlas'
    ]
  },
  {
    title: 'AngularJS Framework',
    slug: 'angularjs',
    category: 'programming',
    level: 'Advanced',
    color: '#dd1b16',
    icon_key: 'angularjs',
    sort_order: 12,
    preview_percent: 20,
    description: 'Build dynamic single-page applications with AngularJS. Master the MVC pattern, dependency injection, and testing.',
    objectives: [
      'Structure apps with AngularJS modules',
      'Build reusable directives and views',
      'Manage data with services',
      'Test and maintain AngularJS apps'
    ],
    outline: [
      'MVC and module setup',
      'Controllers and scope',
      'Directives and templates',
      'Services and dependency injection',
      'Routing with ngRoute',
      'Testing fundamentals'
    ]
  },
  {
    title: 'Excel & Data Analysis',
    slug: 'excel',
    category: 'basic',
    level: 'Beginner',
    color: '#217346',
    icon_key: 'excel',
    sort_order: 13,
    preview_percent: 20,
    description: 'Master Excel for business analysis. Advanced formulas, pivot tables, data visualization, and automation techniques.',
    objectives: [
      'Build reliable spreadsheets and models',
      'Clean, analyze, and visualize data',
      'Use advanced formulas and lookups',
      'Automate workflows with macros'
    ],
    outline: [
      'Core formulas and functions',
      'Data cleaning and prep',
      'Pivot tables and summaries',
      'Charts and dashboards',
      'Lookup functions',
      'Automation with macros'
    ]
  },
  {
    title: 'SPSS Statistical Analysis',
    slug: 'spss',
    category: 'basic',
    level: 'Intermediate',
    color: '#1f4e79',
    icon_key: 'spss',
    sort_order: 14,
    preview_percent: 20,
    description: 'Professional statistical analysis with IBM SPSS. Research methodology, hypothesis testing, and advanced statistical modeling.',
    objectives: [
      'Run descriptive and inferential statistics',
      'Interpret outputs confidently',
      'Model data with regression and ANOVA',
      'Deliver polished research reports'
    ],
    outline: [
      'Data import and cleaning',
      'Descriptive statistics',
      'Hypothesis testing',
      'Correlation and regression',
      'ANOVA and modeling',
      'Reporting and interpretation'
    ]
  },
  {
    title: 'Computer Networking',
    slug: 'networking',
    category: 'basic',
    level: 'Intermediate',
    color: '#0066cc',
    icon_key: 'networking',
    sort_order: 15,
    preview_percent: 20,
    description: 'Understand network infrastructure and protocols. TCP/IP, routing, switching, and network security fundamentals.',
    objectives: [
      'Understand core networking models',
      'Configure IP addressing and routing',
      'Troubleshoot network issues',
      'Apply basic security principles'
    ],
    outline: [
      'OSI and TCP/IP models',
      'IP addressing and subnetting',
      'Routing and switching',
      'DNS and DHCP',
      'Network security basics',
      'Troubleshooting workflows'
    ]
  }
];

const createCohort = async (courseId, title) => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() + 14);
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + (12 * 7));

  const existing = await Cohort.findOne({ course_id: courseId });
  if (existing) {
    return;
  }

  await Cohort.create({
    course_id: courseId,
    name: `${title} Cohort`,
    start_date: startDate,
    end_date: endDate,
    instructor: 'ProgrammoCeuticals Faculty',
    schedule: {
      days_per_week: 3,
      hours_per_session: 2,
      time_slot: '6:00 PM WAT'
    },
    status: 'upcoming'
  });
};

const run = async () => {
  const mongoUri =
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    'mongodb://localhost:27017/cohort-school';
  await mongoose.connect(mongoUri);

  for (const course of courses) {
    const record = await Course.findOneAndUpdate(
      { slug: course.slug },
      { $set: { ...course, is_published: true } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    await syncCourseContent(record);
    await createCohort(record._id, course.title);
  }

  await mongoose.disconnect();
};

run()
  .then(() => {
    console.log('Seed complete');
  })
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  });
