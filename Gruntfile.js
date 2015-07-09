/**
 * Gruntfile for freedom-port-control
**/

var path = require('path');
var freedomChromePath = path.dirname(require.resolve(
  'freedom-for-chrome/package.json'));

module.exports = function(grunt) {
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),

    browserify: {
      main: {
        src: 'src/port-control.js',
        dest: 'build/port-control.js'
      },
      options: {
        browserifyOptions: {
          debug: true,
        }
      }
    },

    copy: {
      chromeDemo: {
        src: ['src/port-control.json',
              'src/demo_chrome_app/*',
              'build/port-control.js',
              freedomChromePath + '/freedom-for-chrome.js*'],
        dest: 'build/demo_chrome_app/',
        flatten: true,
        filter: 'isFile',
        expand: true,
        onlyIf: 'modified'
      },
      dist: {
        src: ['build/port-control.js'],
        dest: 'dist/port-control.js',
      }
    },

    jshint: {
      all: ['src/**/*.js'],
      options: {
        jshintrc: true
      }
    },

    clean: ['build/', 'dist/']
  });

  grunt.loadNpmTasks('grunt-browserify');
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-copy');
  grunt.loadNpmTasks('grunt-contrib-jshint');

  grunt.registerTask('build', [
    'jshint',
    'browserify',
    'copy',
  ]);
  grunt.registerTask('default', [
    'build'
  ]);
}
