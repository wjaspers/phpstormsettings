var fs = require('fs');

var doEscapeCharCode = (function () {
  var obj = {};

  function addMapping(fromChar, toChar) {
    if (fromChar.length !== 1 || toChar.length !== 1) {
      throw Error('String length should be 1');
    }
    var fromCharCode = fromChar.charCodeAt(0);
    if (typeof obj[fromCharCode] === 'undefined') {
      obj[fromCharCode] = toChar;
    }
    else {
      throw Error('Bad mapping');
    }
  }

  addMapping('\n', 'n');
  addMapping('\r', 'r');
  addMapping('\u0085', 'x');
  addMapping('\u2028', 'l');
  addMapping('\u2029', 'p');
  addMapping('|', '|');
  addMapping('\'', '\'');
  addMapping('[', '[');
  addMapping(']', ']');

  return function (charCode) {
    return obj[charCode];
  };
}());

function isAttributeValueEscapingNeeded(str) {
  var len = str.length;
  for (var i = 0; i < len; i++) {
    if (doEscapeCharCode(str.charCodeAt(i))) {
      return true;
    }
  }
  return false;
}

function escapeAttributeValue(str) {
  if (!isAttributeValueEscapingNeeded(str)) {
    return str;
  }
  var res = ''
    , len = str.length;
  for (var i = 0; i < len; i++) {
    var escaped = doEscapeCharCode(str.charCodeAt(i));
    if (escaped) {
      res += '|';
      res += escaped;
    }
    else {
      res += str.charAt(i);
    }
  }
  return res;
}

/**
 * @param {Array} list
 * @param {Number} fromInclusive
 * @param {Number} toExclusive
 * @param {String} delimiterChar one character string
 * @returns {String}
 */
function joinList(list, fromInclusive, toExclusive, delimiterChar) {
  if (list.length === 0) {
    return '';
  }
  if (delimiterChar.length !== 1) {
    throw Error('Delimiter is expected to be a character, but "' + delimiterChar + '" received');
  }
  var addDelimiter = false
    , escapeChar = '\\'
    , escapeCharCode = escapeChar.charCodeAt(0)
    , delimiterCharCode = delimiterChar.charCodeAt(0)
    , result = ''
    , item
    , itemLength
    , ch
    , chCode;
  for (var itemId = fromInclusive; itemId < toExclusive; itemId++) {
    if (addDelimiter) {
      result += delimiterChar;
    }
    addDelimiter = true;
    item = list[itemId];
    itemLength = item.length;
    for (var i = 0; i < itemLength; i++) {
      ch = item.charAt(i);
      chCode = item.charCodeAt(i);
      if (chCode === delimiterCharCode || chCode === escapeCharCode) {
        result += escapeChar;
      }
      result += ch;
    }
  }
  return result;
}

var toString = {}.toString;

function isString(value) {
  return typeof value === 'string' || toString.call(value) === '[object String]';
}

function executeSafely(callback) {
  try {
    callback();
  }
  catch (e) {
    writeSync(process.stderr.fd, e.stack);
  }
}

/**
 * Writes a string to a fileDescriptor synchronously.
 *
 * @param fileDescriptor
 * @param {String} str text to write to fileDescriptor
 * @param {Boolean?} [appendNewLine=false] if true, '\n' character is appended
 */
function writeSync(fileDescriptor, str, appendNewLine) {
  if (appendNewLine) {
    str += '\n';
  }
  var buffer = new Buffer(str, 'utf8');
  fs.writeSync(fileDescriptor, buffer, 0, buffer.length, null);
}

exports.escapeAttributeValue = escapeAttributeValue;
exports.joinList = joinList;
exports.isString = isString;
exports.executeSafely = executeSafely;
exports.writeSync = writeSync;
