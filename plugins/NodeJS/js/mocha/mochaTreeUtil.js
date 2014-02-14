
function getRoot(suiteOrTest) {
  var node = suiteOrTest;
  while (!node.root) {
    node = node.parent;
  }
  return node;
}

function findRoot(runner) {
  if (runner.suite != null) {
    return getRoot(runner.suite)
  }
  if (runner.test != null) {
    return getRoot(runner.test)
  }
  return null;
}

function processTests(node, callback) {
  node.suites.forEach(function (suite) {
    processTests(suite, callback);
  });
  node.tests.forEach(function (test) {
    callback(test);
  });
}

function forEachTest(runner, tree, callback) {
  var root = findRoot(runner);
  if (!root) {
    tree.write("[IDE integration] Looks like Mocha API is broken: runner.on('end', ...) has not been called for unknown reason");
  }
  else {
    processTests(root, callback);
  }
}

function finishTree(tree) {
  tree.root.children.forEach(function (node) {
    node.finishIfStarted();
  });
}

var NODE_PROPERTY_NAME = "intellijTreeNode";

/**
 * @param test
 * @returns {TestNode}
 */
function getNodeForTest(test) {
  if (test.hasOwnProperty(NODE_PROPERTY_NAME)) {
    return test[NODE_PROPERTY_NAME];
  }
  return null;
}

/**
 * @param test mocha test object
 * @param {TestNode} testNode
 */
function setNodeForTest(test, testNode) {
  test[NODE_PROPERTY_NAME] = testNode;
}

module.exports.forEachTest = forEachTest;
module.exports.finishTree = finishTree;

module.exports.getNodeForTest = getNodeForTest;
module.exports.setNodeForTest = setNodeForTest;
