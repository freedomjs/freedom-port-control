/**
 * Gruntfile for freedom-port-control
**/

var path = require('path');
var freedomChromePath = path.dirname(require.resolve(
  'freedom-for-chrome/package.json'));

module.exports = function(grunt) {
  grunt.initConfig({
    copy: {
      build: {
        cwd: 'src/',
        src: ['**'],
        dest: 'build/',
        flatten: false,
        filter: 'isFile',
        expand: true
      },
      freedom: {
        src: [ require.resolve('freedom') ],
        dest: 'build/',
        flatten: true,
        filter: 'isFile',
        expand: true,
        onlyIf: 'modified'
      },
      freedomForChrome: {
        cwd: freedomChromePath,
        src: ['freedom-for-chrome.js*'],
        dest: 'build/demo_chrome_app/',
        flatten: true,
        filter: 'isFile',
        expand: true,
        onlyIf: 'modified'
      },
      chromeDemo: {
        cwd: 'src/',
        src: ['**'],
        dest: 'build/demo_chrome_app/',
        flatten: true,
        filter: 'isFile',
        expand: true,
        onlyIf: 'modified'
      }
    },

    jshint: {
      all: ['src/**/*.js'],
      options: {
        jshintrc: true
      }
    },

    clean: ['build/']
  });

  grunt.loadNpmTasks('grunt-browserify');
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-copy');
  grunt.loadNpmTasks('grunt-contrib-jshint');

  grunt.registerTask('build', [
    'jshint',
    'copy',
  ]);
  grunt.registerTask('default', [
    'build'
  ]);
}
