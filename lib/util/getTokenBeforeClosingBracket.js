'use strict';

function getTokenBeforeClosingBracket(node) {
  const attributes = node.attributes;
  if (attributes.length === 0) {
    return node.name;
  }
  return attributes[attributes.length - 1];
}

module.exports = getTokenBeforeClosingBracket;
