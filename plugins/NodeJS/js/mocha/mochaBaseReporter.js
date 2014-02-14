/*
 * It's suggested that every Mocha reporter should inherit from Mocha Base reporter.
 * See https://github.com/visionmedia/mocha/blob/master/lib/reporters/base.js
 *
 * At least Base reporter is needed to add and update IntellijReporter.stats object that is used by growl reporter.
 *
 * This module locates base.js file by relative path, loads and exports Base reporter constructor.
 */

var path = require('path');

var _mochaPath = process.argv[1];
var _mochaExpectedBasename = '_mocha';
var _mochaActualBasename = path.basename(_mochaPath);

var Base = null;
if (_mochaActualBasename !== _mochaExpectedBasename) {
  console.error("[IDE integration error] '" + _mochaPath + "' is expected to have '" + _mochaExpectedBasename + "' basename.");
}
else {
  var binDir = path.dirname(_mochaPath);
  var baseReporterPath = path.join(binDir, '../lib/reporters/base.js');
  try {
    Base = require(baseReporterPath);
    if (typeof Base !== 'function') {
      Base = null;
      console.error('[IDE integration error] Base reporter loaded from '
                    + baseReporterPath + ' is expected to be a function');
    }
  } catch (e) {
    console.error('[IDE integration error] Can not load base reporter from '
                  + baseReporterPath + ", _mocha: " + _mochaPath, e);
  }
}

module.exports = Base;
