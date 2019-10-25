'use strict';

const astUtil = require('./ast');

function isPropTypesDeclaration(node) {
  if (node && node.type === 'ClassProperty') {
    if (node.typeAnnotation && node.key.name === 'props') {
      return true;
    }
  }
  return astUtil.getPropertyName(node) === 'propTypes';
}

function isContextTypesDeclaration(node) {
  if (node && node.type === 'ClassProperty') {
    if (node.typeAnnotation && node.key.name === 'context') {
      return true;
    }
  }
  return astUtil.getPropertyName(node) === 'contextTypes';
}

function isChildContextTypesDeclaration(node) {
  return astUtil.getPropertyName(node) === 'childContextTypes';
}

function isDefaultPropsDeclaration(node) {
  const propName = astUtil.getPropertyName(node);
  return (propName === 'defaultProps' || propName === 'getDefaultProps');
}

function isRequiredPropType(propTypeExpression) {
  return propTypeExpression.type === 'MemberExpression' && propTypeExpression.property.name === 'isRequired';
}

module.exports = {
  isPropTypesDeclaration,
  isContextTypesDeclaration,
  isChildContextTypesDeclaration,
  isDefaultPropsDeclaration,
  isRequiredPropType
};
