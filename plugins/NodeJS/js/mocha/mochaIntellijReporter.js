var Tree = require('./mochaIntellijTree')
  , util = require('./mochaIntellijUtil')
  , treeUtil = require('./mochaTreeUtil')
  , fs = require('fs')
  , Base = require('./mochaBaseReporter');

/**
 * @param {Tree} tree
 * @param test mocha test object
 * @returns {TestSuiteNode}
 */
function getOrCreateAndRegisterSuiteNode(tree, test) {
  var suites = [];
  var suite = test.parent;
  while (suite != null && !suite.root) {
    suites.push(suite);
    suite = suite.parent;
  }
  suites.reverse();
  var parent = tree.root, suiteId;
  for (suiteId = 0; suiteId < suites.length; suiteId++) {
    suite = suites[suiteId];
    var suiteName = suite.title;
    var childNode = parent.findChildNodeByName(suiteName);
    if (!childNode) {
      var locationPath = getLocationPath(parent, suiteName);
      childNode = parent.addTestSuiteChild(suiteName, 'suite', locationPath);
      childNode.register();
    }
    parent = childNode;
  }
  return parent;
}

/**
 * @param {TestSuiteNode} parent
 * @param {string} childName
 * @returns {string}
 */
function getLocationPath(parent, childName) {
  var names = []
    , node = parent
    , root = node.tree.root;
  while (node !== root) {
    names.push(node.name);
    node = node.parent;
  }
  names.reverse();
  names.push(childName);
  return util.joinList(names, 0, names.length, '.');
}

function stringify(obj) {
  if (obj instanceof RegExp) return obj.toString();
  return JSON.stringify(obj, null, 2);
}

function extractErrInfo(err) {
  var message = err.message || ''
    , stack = err.stack;
  if (!util.isString(stack) || stack.trim().length == 0) {
    return {
      message: message
    }
  }
  var index = stack.indexOf(message);
  if (index >= 0) {
    message = stack.slice(0, index + message.length);
    stack = stack.slice(message.length);
    var nl = '\n';
    if (stack.indexOf(nl) === 0) {
      stack = stack.substring(nl.length);
    }
  }
  return {
    message : message,
    stack : stack
  }
}

/**
 * @param {Tree} tree
 * @param test mocha test object
 * @returns {TestNode}
 */
function registerTestNode(tree, test) {
  var testNode = treeUtil.getNodeForTest(test);
  if (testNode != null) {
    throw Error("Test node has already been associated!");
  }
  var suiteNode = getOrCreateAndRegisterSuiteNode(tree, test);
  var locationPath = getLocationPath(suiteNode, test.title);
  testNode = suiteNode.addTestChild(test.title, 'test', locationPath);
  testNode.register();
  treeUtil.setNodeForTest(test, testNode);
  return testNode;
}

/**
 * @param {Tree} tree
 * @param test mocha test object
 * @returns {TestNode}
 */
function startTest(tree, test) {
  var testNode = treeUtil.getNodeForTest(test);
  if (testNode == null) {
    testNode = registerTestNode(tree, test);
  }
  testNode.start();
  return testNode;
}

/**
 * @param {Tree} tree
 * @param test mocha test object
 * @param {Object} err mocha error object
 */
function finishTestNode(tree, test, err) {
  var testNode = startTest(tree, test);
  if (err) {
    var errInfo = extractErrInfo(err);
    var actualStr, expectedStr;
    if (typeof err.actual != 'undefined' && typeof err.expected != 'undefined') {
      actualStr = stringify(err.actual);
      expectedStr = stringify(err.expected);
      if (!util.isString(actualStr) || !util.isString(expectedStr)) {
        actualStr = null;
        expectedStr = null;
      }
    }
    testNode.setOutcome(Tree.TestOutcome.FAILED, test.duration, errInfo.message, errInfo.stack, actualStr, expectedStr);
  }
  else {
    var status = test.pending ? Tree.TestOutcome.SKIPPED : Tree.TestOutcome.SUCCESS;
    testNode.setOutcome(status, test.duration, null, null, null, null);
  }
  testNode.finish(true);
}

function IntellijReporter(runner) {
  if (Base != null) {
    Base.call(this, runner);
  }

  var executeSafely = util.executeSafely;
  var tree;

  runner.on('start', function () {
    executeSafely(function () {
      tree = new Tree(function (str, appendNewLine) {
        util.writeSync(process.stdout.fd, str, appendNewLine);
      });
      tree.write('##teamcity[enteredTheMatrix]', true);

      var tests = [];
      treeUtil.forEachTest(runner, tree, function (test) {
        tests.push(test);
      });
      tree.write('##teamcity[testCount count=\'' + tests.length + '\']', true);
      tests.forEach(function (test) {
        registerTestNode(tree, test);
      });
    });
  });

  runner.on('test', function (test) {
    executeSafely(function () {
      startTest(tree, test);
    });
  });

  runner.on('pending', function (test) {
    executeSafely(function () {
      finishTestNode(tree, test, null);
    });
  });

  runner.on('pass', function (test) {
    executeSafely(function () {
      finishTestNode(tree, test, null);
    });
  });

  runner.on('fail', function (test, err) {
    executeSafely(function () {
      finishTestNode(tree, test, err);
    });
  });

  runner.on('end', function () {
    executeSafely(function () {
      tree = null;
    });
  });

}

module.exports = IntellijReporter;
