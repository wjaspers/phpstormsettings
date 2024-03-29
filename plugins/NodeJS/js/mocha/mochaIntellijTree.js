var path = require('path')
  , util = require('./mochaIntellijUtil');

function inherit(child, parent) {
  function F() {
    this.constructor = child;
  }

  F.prototype = parent.prototype;
  child.prototype = new F();
  return child;
}


function Tree(write) {
  /**
   * @type {Function}
   * @protected
   */
  this.write = write;
  /**
   * Invisible root. No messages should be sent to IDE for this node.
   * @type {TestSuiteNode}
   * @public
   */
  this.root = new TestSuiteNode(this, 0, null, 'hidden root', null, null);
  /**
   * @type {number}
   * @protected
   */
  this.nextId = 1;
}

/**
 * Node class is a base abstract class for TestSuiteNode and TestNode classes.
 *
 * @param {Tree} tree test tree
 * @param {number} id this node ID. It should be unique among all node IDs that belong to the same tree.
 * @param {TestSuiteNode} parent parent node
 * @param {string} name node name (it could be a suite/spec name)
 * @param {string} type node type (e.g. 'config', 'browser')
 * @param {string} locationPath string that is used by IDE to navigate to the definition of the node
 * @abstract
 * @constructor
 */
function Node(tree, id, parent, name, type, locationPath) {
  /**
   * @type {Tree}
   * @protected
   */
  this.tree = tree;
  /**
   * @type {number}
   * @private
   */
  this.id = id;
  /**
   * @type {TestSuiteNode}
   * @public
   */
  this.parent = parent;
  /**
   * @type {string}
   * @public
   */
  this.name = name;
  /**
   * @type {string}
   * @private
   */
  this.type = type;
  /**
   * @type {string}
   * @private
   */
  this.locationPath = locationPath;
  /**
   * @type {NodeState}
   * @protected
   */
  this.state = NodeState.CREATED;
}

/**
 * @param name
 * @constructor
 * @private
 */
function NodeState(name) {
  this.name = name;
}
NodeState.CREATED = new NodeState('created');
NodeState.REGISTERED = new NodeState('registered');
NodeState.STARTED = new NodeState('started');
NodeState.FINISHED = new NodeState('finished');

/**
 * Changes node's state to 'REGISTERED' and sends corresponding message to IDE.
 * In response to this message IDE will add a node with 'non-spinning' icon to its test tree.
 * @public
 */
Node.prototype.register = function () {
  var text = this.getRegisterMessage();
  this.tree.write(text, true);
  this.state = NodeState.REGISTERED;
};

/**
 * @returns {string}
 * @private
 */
Node.prototype.getRegisterMessage = function () {
  if (this.state === NodeState.CREATED) {
    return this.getInitMessage(false);
  }
  throw Error('Unexpected node state: ' + this.state);
};

/**
 * @param {boolean} running
 * @returns {string}
 * @private
 */
Node.prototype.getInitMessage = function (running) {
  var startCommandName = this.getStartCommandName();
  var text = '##teamcity[';
  text += startCommandName;
  text += ' nodeId=\'' + this.id;
  var parentId = this.parent ? this.parent.id : 0;
  text += '\' parentNodeId=\'' + parentId;
  text += '\' name=\'' + util.escapeAttributeValue(this.name);
  text += '\' running=\'' + running;
  if (this.type != null) {
    text += '\' nodeType=\'' + this.type;
    if (this.locationPath != null) {
      text += '\' locationHint=\'' + util.escapeAttributeValue(this.type + '://' + this.locationPath);
    }
  }
  text += '\']';
  return text;
};

/**
 * Changes node's state to 'STARTED' and sends a corresponding message to IDE.
 * In response to this message IDE will do either of:
 * - if IDE test tree doesn't have a node, the node will be added with 'spinning' icon
 * - if IDE test tree has a node, the node's icon will be changed to 'spinning' one
 * @public
 */
Node.prototype.start = function () {
  if (this.state === NodeState.FINISHED) {
    throw Error("Unexpected node state: " + this.state);
  }
  if (this.state === NodeState.STARTED) {
    // do nothing in case of starting already started node
    return;
  }
  var text = this.getStartMessage();
  this.tree.write(text, true);
  this.state = NodeState.STARTED;
  var parent = this.parent;
  if (parent != null && parent != this.tree.root) {
    parent.start();
  }
};

/**
 * @returns {String}
 * @private
 */
Node.prototype.getStartMessage = function () {
  if (this.state === NodeState.CREATED) {
    return this.getInitMessage(true);
  }
  if (this.state === NodeState.REGISTERED) {
    var commandName = this.getStartCommandName();
    return '##teamcity[' + commandName + ' nodeId=\'' + this.id + '\' running=\'true\']';
  }
  throw Error("Unexpected node state: " + this.state);
};

/**
 * @return {string}
 * @abstract
 * @private
 */
Node.prototype.getStartCommandName = function () {
  throw Error('Must be implemented by subclasses');
};

/**
 * Changes node's state to 'FINISHED' and sends corresponding message to IDE.
 * @param {boolean?} finishParentIfLast if true, parent node will be finished if all sibling nodes have already been finished
 * @public
 */
Node.prototype.finish = function (finishParentIfLast) {
  if (this.state !== NodeState.REGISTERED && this.state !== NodeState.STARTED) {
    throw Error('Unexpected node state: ' + this.state);
  }
  var text = this.getFinishMessage();
  this.tree.write(text, true);
  this.state = NodeState.FINISHED;
  if (finishParentIfLast) {
    var parent = this.parent;
    if (parent != null && parent != this.tree.root) {
      parent.onChildFinished();
    }
  }
};

/**
 * @returns {string}
 * @private
 */
Node.prototype.getFinishMessage = function () {
  var text = '##teamcity[' + this.getFinishCommandName();
  text += ' nodeId=\'' + this.id + '\'';
  var extraParameters = this.getExtraFinishMessageParameters();
  if (extraParameters) {
    text += extraParameters;
  }
  text += ']';
  return text;
};

/**
 * @returns {string}
 * @abstract
 * @private
 */
Node.prototype.getExtraFinishMessageParameters = function () {
  throw Error('Must be implemented by subclasses');
};

Node.prototype.finishIfStarted = function () {
  if (this.state !== NodeState.FINISHED) {
    for (var i = 0; i < this.children.length; i++) {
      this.children[i].finishIfStarted();
    }
    this.finish();
  }
};

/**
 * TestSuiteNode child of Node class. Represents a non-leaf node without state (its state is computed by its child states).
 *
 * @param {Tree} tree test tree
 * @param {number} id this node's ID. It should be unique among all node IDs that belong to the same tree.
 * @param {TestSuiteNode} parent parent node
 * @param {String} name node name (e.g. config file name / browser name / suite name)
 * @param {String} type node type (e.g. 'config', 'browser')
 * @param {String} locationPath navigation info
 * @constructor
 * @extends Node
 */
function TestSuiteNode(tree, id, parent, name, type, locationPath) {
  Node.call(this, tree, id, parent, name, type, locationPath);
  /**
   * @type {Array}
   * @private
   */
  this.children = [];
  /**
   * @type {Object}
   * @private
   */
  this.lookupMap = {};
  /**
   * @type {number}
   * @private
   */
  this.finishedChildCount = 0;
}

inherit(TestSuiteNode, Node);

/**
 * Returns child node by its name.
 * @param childName
 * @returns {?Node} child node (null, if no child node with such name found)
 */
TestSuiteNode.prototype.findChildNodeByName = function(childName) {
  if (Object.prototype.hasOwnProperty.call(this.lookupMap, childName)) {
    return this.lookupMap[childName];
  }
  return null;
};

/**
 * @returns {string}
 * @private
 */
TestSuiteNode.prototype.getStartCommandName = function () {
  return 'testSuiteStarted';
};

/**
 * @returns {string}
 * @private
 */
TestSuiteNode.prototype.getFinishCommandName = function () {
  return 'testSuiteFinished';
};

/**
 * @returns {string}
 * @private
 */
TestSuiteNode.prototype.getExtraFinishMessageParameters = function () {
  return null;
};

/**
 * Adds a new test child.
 * @param {String} childName node name (e.g. browser name / suite name / spec name)
 * @param {String} nodeType child node type (e.g. 'config', 'browser')
 * @param {String} locationPath navigation info
 * @returns {TestNode}
 */
TestSuiteNode.prototype.addTestChild = function (childName, nodeType, locationPath) {
  if (this.state === NodeState.FINISHED) {
    throw Error('Child node cannot be created for finished nodes!');
  }
  var childId = this.tree.nextId++;
  var child = new TestNode(this.tree, childId, this, childName, nodeType, locationPath);
  this.children.push(child);
  this.lookupMap[childName] = child;
  return child;
};

/**
 * Adds a new child for this suite node.
 * @param {String} childName node name (e.g. browser name / suite name / spec name)
 * @param {String} nodeType child node type (e.g. 'config', 'browser')
 * @param {String} locationPath navigation info
 * @returns {TestSuiteNode}
 */
TestSuiteNode.prototype.addTestSuiteChild = function (childName, nodeType, locationPath) {
  if (this.state === NodeState.FINISHED) {
    throw Error('Child node cannot be created for finished nodes!');
  }
  var childId = this.tree.nextId++;
  var child = new TestSuiteNode(this.tree, childId, this, childName, nodeType, locationPath);
  this.children.push(child);
  this.lookupMap[childName] = child;
  return child;
};

/**
 * @protected
 */
TestSuiteNode.prototype.onChildFinished = function() {
  this.finishedChildCount++;
  if (this.finishedChildCount === this.children.length) {
    if (this.state !== NodeState.FINISHED) {
      this.finish(true);
    }
  }
};

/**
 * TestNode class that represents a test node.
 *
 * @param {Tree} tree test tree
 * @param {number} id this node ID. It should be unique among all node IDs that belong to the same tree.
 * @param {TestSuiteNode} parent parent node
 * @param {string} name node name (spec name)
 * @param {string} type node type (e.g. 'config', 'browser')
 * @param {string} locationPath navigation info
 * @constructor
 */
function TestNode(tree, id, parent, name, type, locationPath) {
  Node.call(this, tree, id, parent, name, type, locationPath);
  /**
   * @type {TestOutcome}
   * @private
   */
  this.outcome = undefined;
  /**
   * @type {number}
   * @private
   */
  this.durationMillis = undefined;
  /**
   * @type {string}
   * @private
   */
  this.failureMsg = undefined;
  /**
   * @type {string}
   * @private
   */
  this.failureDetails = undefined;
  /**
   * @type {string}
   * @private
   */
  this.actualStr = undefined;
  /**
   * @type {string}
   * @private
   */
  this.expectedStr = undefined;
}

inherit(TestNode, Node);

/**
 * @param name
 * @constructor
 * @private
 */
function TestOutcome(name) {
  this.name = name;
}

TestOutcome.SUCCESS = new TestOutcome("success");
TestOutcome.SKIPPED = new TestOutcome("skipped");
TestOutcome.FAILED = new TestOutcome("failed");
TestOutcome.ERROR = new TestOutcome("error");

Tree.TestOutcome = TestOutcome;

/**
 * @param {TestOutcome} outcome test outcome
 * @param {number} durationMillis test duration is ms
 * @param {string} failureMsg
 * @param failureDetails {string} stack trace
 * @param actualStr {string} actual value
 * @param expectedStr {string} expected value
 * @public
 */
TestNode.prototype.setOutcome = function (outcome, durationMillis, failureMsg, failureDetails, actualStr, expectedStr) {
  if (this.outcome != null) {
    throw Error("Test outcome has already been set!");
  }
  this.outcome = outcome;
  this.durationMillis = durationMillis;
  this.failureMsg = failureMsg;
  this.failureDetails = failureDetails;
  this.actualStr = actualStr;
  this.expectedStr = expectedStr;
  if (outcome === TestOutcome.SKIPPED && !failureMsg) {
    this.failureMsg = 'Pending test \'' + this.name + '\'';
  }
};

/**
 * @returns {string}
 * @private
 */
TestNode.prototype.getStartCommandName = function () {
  return 'testStarted';
};

/**
 * @returns {string}
 * @private
 */
TestNode.prototype.getFinishCommandName = function () {
  switch (this.outcome) {
    case TestOutcome.SUCCESS:
      return 'testFinished';
    case TestOutcome.SKIPPED:
      return 'testIgnored';
    case TestOutcome.FAILED:
      return 'testFailed';
    case TestOutcome.ERROR:
      return 'testFailed';
    default:
      throw Error('Unexpected outcome: ' + this.outcome);
  }
};

/**
 *
 * @returns {string}
 * @private
 */
TestNode.prototype.getExtraFinishMessageParameters = function () {
  var params = '';
  if (typeof this.durationMillis === 'number') {
    params += ' duration=\'' + this.durationMillis + '\'';
  }
  if (this.outcome === TestOutcome.ERROR) {
    params += ' error=\'yes\'';
  }
  if (util.isString(this.failureMsg)) {
    params += ' message=\'' + util.escapeAttributeValue(this.failureMsg) + '\'';
  }
  if (util.isString(this.failureDetails)) {
    params += ' details=\'' + util.escapeAttributeValue(this.failureDetails) + '\'';
  }
  if (util.isString(this.actualStr)) {
    params += ' actual=\'' + util.escapeAttributeValue(this.actualStr) + '\'';
  }
  if (util.isString(this.expectedStr)) {
    params += ' expected=\'' + util.escapeAttributeValue(this.expectedStr) + '\'';
  }
  return params.length === 0 ? null : params;
};


module.exports = Tree;
