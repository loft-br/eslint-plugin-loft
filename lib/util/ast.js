'use strict';

function findReturnStatement(node) {
  if (
    (!node.value || !node.value.body || !node.value.body.body) &&
    (!node.body || !node.body.body)
  ) {
    return false;
  }

  const bodyNodes = (node.value ? node.value.body.body : node.body.body);

  return (function loopNodes(nodes) {
    let i = nodes.length - 1;
    for (; i >= 0; i--) {
      if (nodes[i].type === 'ReturnStatement') {
        return nodes[i];
      }
      if (nodes[i].type === 'SwitchStatement') {
        let j = nodes[i].cases.length - 1;
        for (; j >= 0; j--) {
          return loopNodes(nodes[i].cases[j].consequent);
        }
      }
    }
    return false;
  }(bodyNodes));
}

function getPropertyNameNode(node) {
  if (node.key || ['MethodDefinition', 'Property'].indexOf(node.type) !== -1) {
    return node.key;
  }
  if (node.type === 'MemberExpression') {
    return node.property;
  }
  return null;
}

function getPropertyName(node) {
  const nameNode = getPropertyNameNode(node);
  return nameNode ? nameNode.name : '';
}

function isFunctionLikeExpression(node) {
  return node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression';
}

function stripQuotes(string) {
  return string.replace(/^'|'$/g, '');
}

function getKeyValue(context, node) {
  if (node.type === 'ObjectTypeProperty') {
    const tokens = context.getFirstTokens(node, 2);
    return (tokens[0].value === '+' || tokens[0].value === '-' ?
      tokens[1].value :
      stripQuotes(tokens[0].value)
    );
  }
  const key = node.key || node.argument;
  return key.type === 'Identifier' ? key.name : key.value;
}

function isAssignmentLHS(node) {
  return (
    node.parent &&
    node.parent.type === 'AssignmentExpression' &&
    node.parent.left === node
  );
}

module.exports = {
  findReturnStatement,
  getPropertyName,
  getKeyValue,
  isAssignmentLHS,
  isFunctionLikeExpression,
};
