'use strict';

function isJSX(node) {
  return node && ['JSXElement', 'JSXFragment'].indexOf(node.type) >= 0;
}

module.exports = {
  isJSX,
};
