'use strict';

function isAnnotatedFunctionPropsDeclaration(node, context) {
  if (!node || !node.params || !node.params.length) {
    return false;
  }

  const typeNode = node.params[0].type === 'AssignmentPattern' ? node.params[0].left : node.params[0];

  const tokens = context.getFirstTokens(typeNode, 2);
  const isAnnotated = typeNode.typeAnnotation;
  const isDestructuredProps = typeNode.type === 'ObjectPattern';
  const isProps = tokens[0].value === 'props' || (tokens[1] && tokens[1].value === 'props');

  return (isAnnotated && (isDestructuredProps || isProps));
}

module.exports = {
  isAnnotatedFunctionPropsDeclaration
};
