/*global module:false*/

var path = require('path');

module.exports = function(grunt)
{
  'use strict';

  var buildDir = './build/';
  var lcovInstrumentDir = './build/instrument/';
  var lcovReportDir = './build/coverage/';
  var srcLibForTestsDir = path.resolve(__dirname, 'lib/');
  var lcovLibForTestsDir = path.resolve(__dirname, lcovInstrumentDir, 'lib');

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    clean: {
      coverage: [lcovInstrumentDir, lcovReportDir],
      all: buildDir
    },
    env: {
      default: {
        LIB_FOR_TESTS_DIR: srcLibForTestsDir
      },
      coverage: {
        LIB_FOR_TESTS_DIR: lcovLibForTestsDir
      }
    },
    jshint: {
      src: [
        './lib/**/*.js',
        './test/**/*.js'
      ],
      options: {
        jshintrc: '.jshintrc'
      }
    },
    simplemocha: {
      all: {
        src: './test/**/*.js'
      },
      unit: {
        src: './test/unit/**/*.js'
      },
      func: {
        src: './test/functional/**/*.js'
      },
      options: {
        ignoreLeaks: false,
        globals: ['should'],
        ui: 'bdd',
        reporter: 'dot'
      }
    },
    instrument: {
      files: './lib/**/*.js',
      options: {
        basePath : lcovInstrumentDir
      }
    },
    storeCoverage: {
      options: {
        dir: lcovReportDir
      }
    },
    makeReport: {
      src: lcovReportDir + 'coverage.json',
      options : {
        reporters: {
          lcov: {dir: lcovReportDir},
          text: true
        }
      }
    }
  });

  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-env');
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-simple-mocha');
  grunt.loadNpmTasks('grunt-istanbul');

  grunt.registerTask('test', [
    'env:default',
    'simplemocha:all'
  ]);

  grunt.registerTask('test-func', [
    'env:default',
    'simplemocha:func'
  ]);

  grunt.registerTask('coverage', [
    'clean:coverage',
    'env:coverage',
    'instrument',
    'simplemocha:all',
    'storeCoverage',
    'makeReport'
  ]);

  grunt.registerTask('coverage-unit', [
    'clean:coverage',
    'env:coverage',
    'instrument',
    'simplemocha:unit',
    'storeCoverage',
    'makeReport'
  ]);

  grunt.registerTask('coverage-func', [
    'clean:coverage',
    'env:coverage',
    'instrument',
    'simplemocha:func',
    'storeCoverage',
    'makeReport'
  ]);

  grunt.registerTask('default', [
    'clean',
    'jshint',
    'coverage'
  ]);
};
