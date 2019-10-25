'use strict';

const fromEntries = require('object.fromentries');
const astUtil = require('./ast');
const propsUtil = require('./props');
const variableUtil = require('./variable');
const propWrapperUtil = require('../util/propWrapper');

const QUOTES_REGEX = /^["']|["']$/g;

module.exports = function defaultPropsInstructions(context, components, utils) {
  const sourceCode = context.getSourceCode();

  function resolveNodeValue(node) {
    if (node.type === 'Identifier') {
      return variableUtil.findVariableByName(context, node.name);
    }
    if (
      node.type === 'CallExpression' &&
      propWrapperUtil.isPropWrapperFunction(context, node.callee.name) &&
      node.arguments && node.arguments[0]
    ) {
      return resolveNodeValue(node.arguments[0]);
    }
    return node;
  }

  function getDefaultPropsFromObjectExpression(objectExpression) {
    const hasSpread = objectExpression.properties.find(property => property.type === 'ExperimentalSpreadProperty' || property.type === 'SpreadElement');

    if (hasSpread) {
      return 'unresolved';
    }

    return objectExpression.properties.map(defaultProp => ({
      name: sourceCode.getText(defaultProp.key).replace(QUOTES_REGEX, ''),
      node: defaultProp
    }));
  }

  function markDefaultPropsAsUnresolved(component) {
    components.set(component.node, {
      defaultProps: 'unresolved'
    });
  }

  function addDefaultPropsToComponent(component, defaultProps) {
    if (component.defaultProps === 'unresolved') {
      return;
    }

    if (defaultProps === 'unresolved') {
      markDefaultPropsAsUnresolved(component);
      return;
    }

    const defaults = component.defaultProps || {};
    const newDefaultProps = Object.assign(
      {},
      defaults,
      fromEntries(defaultProps.map(prop => [prop.name, prop]))
    );

    components.set(component.node, {
      defaultProps: newDefaultProps
    });
  }

  return {
    MemberExpression(node) {
      const isDefaultProp = propsUtil.isDefaultPropsDeclaration(node);

      if (!isDefaultProp) {
        return;
      }

      const component = utils.getRelatedComponent(node);
      if (!component) {
        return;
      }

      if (node.parent.type === 'AssignmentExpression') {
        const expression = resolveNodeValue(node.parent.right);
        if (!expression || expression.type !== 'ObjectExpression') {

          if (isDefaultProp) {
            markDefaultPropsAsUnresolved(component);
          }

          return;
        }

        addDefaultPropsToComponent(component, getDefaultPropsFromObjectExpression(expression));

        return;
      }

      if (node.parent.type === 'MemberExpression' && node.parent.parent &&
        node.parent.parent.type === 'AssignmentExpression') {
        addDefaultPropsToComponent(component, [{
          name: node.parent.property.name,
          node: node.parent.parent
        }]);
      }
    },

    MethodDefinition(node) {
      if (!node.static || node.kind !== 'get') {
        return;
      }

      if (!propsUtil.isDefaultPropsDeclaration(node)) {
        return;
      }

      const component = components.get(utils.getParentES6Component());
      if (!component) {
        return;
      }

      const returnStatement = utils.findReturnStatement(node);
      if (!returnStatement) {
        return;
      }

      const expression = resolveNodeValue(returnStatement.argument);
      if (!expression || expression.type !== 'ObjectExpression') {
        return;
      }

      addDefaultPropsToComponent(component, getDefaultPropsFromObjectExpression(expression));
    },

    ClassProperty(node) {
      if (!(node.static && node.value)) {
        return;
      }

      const propName = astUtil.getPropertyName(node);
      const isDefaultProp = propName === 'defaultProps' || propName === 'getDefaultProps';

      if (!isDefaultProp) {
        return;
      }

      const component = components.get(utils.getParentES6Component());
      if (!component) {
        return;
      }

      const expression = resolveNodeValue(node.value);
      if (!expression || expression.type !== 'ObjectExpression') {
        return;
      }

      addDefaultPropsToComponent(component, getDefaultPropsFromObjectExpression(expression));
    },

    ObjectExpression(node) {
      const component = utils.isES5Component(node) && components.get(node);
      if (!component) {
        return;
      }

      node.properties.forEach((property) => {
        if (property.type === 'ExperimentalSpreadProperty' || property.type === 'SpreadElement') {
          return;
        }

        const isDefaultProp = propsUtil.isDefaultPropsDeclaration(property);

        if (isDefaultProp && property.value.type === 'FunctionExpression') {
          const returnStatement = utils.findReturnStatement(property);
          if (!returnStatement || returnStatement.argument.type !== 'ObjectExpression') {
            return;
          }

          addDefaultPropsToComponent(component, getDefaultPropsFromObjectExpression(returnStatement.argument));
        }
      });
    }
  };
};
