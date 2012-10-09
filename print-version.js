#!/usr/bin/env node
// node script to emit the current version of the source code

var requirejs = require('./r.js');
requirejs(['./assets/www/version'], function(version) {
    console.log(version);
});
