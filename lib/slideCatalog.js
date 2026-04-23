const fs = require('fs');
const path = require('path');
const vm = require('vm');

const slideSourceMap = {
  python: {
    file: 'slidesData.js',
    exportName: 'slidesData'
  },
  javascript: {
    file: 'javascriptSlidesData.js',
    exportName: 'javascriptSlidesData'
  },
  html: {
    file: 'htmlSlidesData.js',
    exportName: 'htmlSlidesData'
  },
  css: {
    file: 'cssSlidesData.js',
    exportName: 'cssSlidesData'
  },
  react: {
    file: 'reactSlidesData.js',
    exportName: 'reactSlidesData'
  },
  nodejs: {
    file: 'nodejsSlidesData.js',
    exportName: 'nodejsSlidesData'
  },
  dsa: {
    file: 'dsaSlidesData.js',
    exportName: 'dsaSlidesData'
  },
  hosting: {
    file: 'hostingSlidesData.js',
    exportName: 'hostingSlidesData'
  },
  django: {
    file: 'djangoSlidesData.js',
    exportName: 'djangoSlidesData'
  },
  excel: {
    file: 'excelSlidesData.js',
    exportName: 'excelSlidesData'
  },
  spss: {
    file: 'spssSlidesData.js',
    exportName: 'spssSlidesData'
  },
  sql: {
    file: 'sqlSlidesData.js',
    exportName: 'sqlSlidesData'
  },
  networking: {
    file: 'networkingSlidesData.js',
    exportName: 'networkingSlidesData'
  },
  mongodb: {
    file: 'mongodbSlidesData.js',
    exportName: 'mongodbSlidesData'
  },
  angularjs: {
    file: 'angularjsSlidesData.js',
    exportName: 'angularjsSlidesData'
  }
};

const slideCache = new Map();

const parseClientSlideModule = (absolutePath, exportName) => {
  const source = fs.readFileSync(absolutePath, 'utf8');
  const exportPattern = new RegExp(
    `^\\s*export\\s+const\\s+${exportName}\\s*=`,
    'm'
  );
  const transformed = source.replace(exportPattern, 'module.exports =');
  if (transformed === source) {
    throw new Error(
      `Could not locate export "${exportName}" in ${absolutePath}`
    );
  }

  const sandbox = {
    module: { exports: [] },
    exports: {},
    require,
    console
  };
  vm.createContext(sandbox);
  new vm.Script(transformed, { filename: absolutePath }).runInContext(sandbox);
  return sandbox.module.exports;
};

const getSlidesForLanguage = (languageSlug) => {
  if (!languageSlug) {
    return [];
  }

  const key = String(languageSlug).toLowerCase();
  if (slideCache.has(key)) {
    return slideCache.get(key);
  }

  const source = slideSourceMap[key];
  if (!source) {
    return [];
  }

  const absolutePath = path.resolve(
    __dirname,
    '../../client/src/data',
    source.file
  );
  const slides = parseClientSlideModule(absolutePath, source.exportName);
  const normalized = Array.isArray(slides) ? slides : [];
  slideCache.set(key, normalized);
  return normalized;
};

module.exports = {
  getSlidesForLanguage,
  slideSourceMap
};
