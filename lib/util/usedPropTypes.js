'use strict';

const astUtil = require('./ast');
const versionUtil = require('./version');
const ast = require('./ast');


const LIFE_CYCLE_METHODS = ['componentWillReceiveProps', 'shouldComponentUpdate', 'componentWillUpdate', 'componentDidUpdate'];
const ASYNC_SAFE_LIFE_CYCLE_METHODS = ['getDerivedStateFromProps', 'getSnapshotBeforeUpdate', 'UNSAFE_componentWillReceiveProps', 'UNSAFE_componentWillUpdate'];

function createPropVariables() {
  let propVariables = new Map();
  let hasBeenWritten = false;
  const stack = [{propVariables, hasBeenWritten}];
  return {
    pushScope() {
      stack.push({propVariables, hasBeenWritten: false});
    },
    popScope() {
      stack.pop();
      propVariables = stack[stack.length - 1].propVariables;
      hasBeenWritten = stack[stack.length - 1].hasBeenWritten;
    },
    set(name, allNames) {
      if (!hasBeenWritten) {
        propVariables = new Map(propVariables);
        Object.assign(stack[stack.length - 1], {propVariables, hasBeenWritten: true});
        stack[stack.length - 1].hasBeenWritten = true;
      }
      return propVariables.set(name, allNames);
    },
    get(name) {
      return propVariables.get(name);
    }
  };
}

function isCommonVariableNameForProps(name) {
  return name === 'props' || name === 'nextProps' || name === 'prevProps';
}

function mustBeValidated(component) {
  return !!(component && !component.ignorePropsValidation);
}

function inLifeCycleMethod(context, checkAsyncSafeLifeCycles) {
  let scope = context.getScope();
  while (scope) {
    if (scope.block && scope.block.parent && scope.block.parent.key) {
      const name = scope.block.parent.key.name;

      if (LIFE_CYCLE_METHODS.indexOf(name) >= 0) {
        return true;
      }
      if (checkAsyncSafeLifeCycles && ASYNC_SAFE_LIFE_CYCLE_METHODS.indexOf(name) >= 0) {
        return true;
      }
    }
    scope = scope.upper;
  }
  return false;
}

function isNodeALifeCycleMethod(node, checkAsyncSafeLifeCycles) {
  const nodeKeyName = (node.key || ({})).name;

  if (node.kind === 'constructor') {
    return true;
  }
  if (LIFE_CYCLE_METHODS.indexOf(nodeKeyName) >= 0) {
    return true;
  }
  if (checkAsyncSafeLifeCycles && ASYNC_SAFE_LIFE_CYCLE_METHODS.indexOf(nodeKeyName) >= 0) {
    return true;
  }

  return false;
}

function isInLifeCycleMethod(node, checkAsyncSafeLifeCycles) {
  if ((node.type === 'MethodDefinition' || node.type === 'Property') && isNodeALifeCycleMethod(node, checkAsyncSafeLifeCycles)) {
    return true;
  }

  if (node.parent) {
    return isInLifeCycleMethod(node.parent, checkAsyncSafeLifeCycles);
  }

  return false;
}

function isSetStateUpdater(node) {
  return node.parent.type === 'CallExpression' &&
    node.parent.callee.property &&
    node.parent.callee.property.name === 'setState' &&
    node.parent.arguments[0] === node;
}

function isPropArgumentInSetStateUpdater(context, name) {
  if (typeof name !== 'string') {
    return;
  }
  let scope = context.getScope();
  while (scope) {
    if (
      scope.block && scope.block.parent &&
      scope.block.parent.type === 'CallExpression' &&
      scope.block.parent.callee.property &&
      scope.block.parent.callee.property.name === 'setState' &&
      scope.block.parent.arguments[0].start === scope.block.start &&
      scope.block.parent.arguments[0].params &&
      scope.block.parent.arguments[0].params.length > 1
    ) {
      return scope.block.parent.arguments[0].params[1].name === name;
    }
    scope = scope.upper;
  }
  return false;
}

function isInClassComponent(utils) {
  return utils.getParentES6Component() || utils.getParentES5Component();
}

function isThisDotProps(node) {
  return !!node &&
    node.type === 'MemberExpression' &&
    node.object.type === 'ThisExpression' &&
    node.property.name === 'props';
}

function hasSpreadOperator(context, node) {
  const tokens = context.getSourceCode().getTokens(node);
  return tokens.length && tokens[0].value === '...';
}

function getPropertyName(node) {
  const property = node.property;
  if (property) {
    switch (property.type) {
      case 'Identifier':
        if (node.computed) {
          return '__COMPUTED_PROP__';
        }
        return property.name;
      case 'MemberExpression':
        return;
      case 'Literal':
        if (typeof property.value === 'string') {
          return property.value;
        }
      default:
        if (node.computed) {
          return '__COMPUTED_PROP__';
        }
        break;
    }
  }
}

function isPropTypesUsageByMemberExpression(node, context, utils, checkAsyncSafeLifeCycles) {
  if (isInClassComponent(utils)) {
    if (isThisDotProps(node.object)) {
      return true;
    }

    if (
      isCommonVariableNameForProps(node.object.name) &&
      (inLifeCycleMethod(context, checkAsyncSafeLifeCycles) || utils.inConstructor())
    ) {
      return true;
    }

    if (isPropArgumentInSetStateUpdater(context, node.object.name)) {
      return true;
    }
    return false;
  }

  return node.object.name === 'props' && !ast.isAssignmentLHS(node);
}

module.exports = function usedPropTypesInstructions(context, components, utils) {
  const checkAsyncSafeLifeCycles = versionUtil.testReactVersion(context, '16.3.0');

  const propVariables = createPropVariables();
  const pushScope = propVariables.pushScope;
  const popScope = propVariables.popScope;

  function markPropTypesAsUsed(node, parentNames) {
    parentNames = parentNames || [];
    let type;
    let name;
    let allNames;
    let properties;
    switch (node.type) {
      case 'MemberExpression':
        name = getPropertyName(node);
        if (name) {
          allNames = parentNames.concat(name);
          if (
            node.parent.type === 'MemberExpression' &&
            node.parent.object === node
          ) {
            markPropTypesAsUsed(node.parent, allNames);
          }
          if (
            node.parent.type === 'VariableDeclarator' &&
            node.parent.id.type === 'ObjectPattern'
          ) {
            node.parent.id.parent = node.parent;
            markPropTypesAsUsed(node.parent.id, allNames);
          }

          if (
            node.parent.type === 'VariableDeclarator' &&
            node.parent.id.type === 'Identifier'
          ) {
            propVariables.set(node.parent.id.name, allNames);
          }
          type = name !== '__COMPUTED_PROP__' ? 'direct' : null;
        }
        break;
      case 'ArrowFunctionExpression':
      case 'FunctionDeclaration':
      case 'FunctionExpression': {
        if (node.params.length === 0) {
          break;
        }
        type = 'destructuring';
        const propParam = isSetStateUpdater(node) ? node.params[1] : node.params[0];
        properties = propParam.type === 'AssignmentPattern' ?
          propParam.left.properties :
          propParam.properties;
        break;
      }
      case 'ObjectPattern':
        type = 'destructuring';
        properties = node.properties;
        break;
      default:
        throw new Error(`${node.type} ASTNodes are not handled by markPropTypesAsUsed`);
    }

    const component = components.get(utils.getParentComponent());
    const usedPropTypes = component && component.usedPropTypes || [];
    let ignoreUnusedPropTypesValidation = component && component.ignoreUnusedPropTypesValidation || false;

    switch (type) {
      case 'direct': {
        if (name in Object.prototype) {
          break;
        }

        const reportedNode = node.property;
        usedPropTypes.push({
          name,
          allNames,
          node: reportedNode
        });
        break;
      }
      case 'destructuring': {
        for (let k = 0, l = (properties || []).length; k < l; k++) {
          if (hasSpreadOperator(context, properties[k]) || properties[k].computed) {
            ignoreUnusedPropTypesValidation = true;
            break;
          }
          const propName = ast.getKeyValue(context, properties[k]);

          if (!propName || properties[k].type !== 'Property') {
            break;
          }

          usedPropTypes.push({
            allNames: parentNames.concat([propName]),
            name: propName,
            node: properties[k]
          });

          if (properties[k].value.type === 'ObjectPattern') {
            markPropTypesAsUsed(properties[k].value, parentNames.concat([propName]));
          } else if (properties[k].value.type === 'Identifier') {
            propVariables.set(propName, parentNames.concat(propName));
          }
        }
        break;
      }
      default:
        break;
    }

    components.set(component ? component.node : node, {
      usedPropTypes,
      ignoreUnusedPropTypesValidation
    });
  }

  function markDestructuredFunctionArgumentsAsUsed(node) {
    const param = node.params && isSetStateUpdater(node) ? node.params[1] : node.params[0];

    const destructuring = param && (
      param.type === 'ObjectPattern' ||
      param.type === 'AssignmentPattern' && param.left.type === 'ObjectPattern'
    );

    if (destructuring && (components.get(node) || components.get(node.parent))) {
      markPropTypesAsUsed(node);
    }
  }

  function handleSetStateUpdater(node) {
    if (!node.params || node.params.length < 2 || !isSetStateUpdater(node)) {
      return;
    }
    markPropTypesAsUsed(node);
  }

  function handleFunctionLikeExpressions(node) {
    pushScope();
    handleSetStateUpdater(node);
    markDestructuredFunctionArgumentsAsUsed(node);
  }

  function handleCustomValidators(component) {
    const propTypes = component.declaredPropTypes;
    if (!propTypes) {
      return;
    }

    Object.keys(propTypes).forEach((key) => {
      const node = propTypes[key].node;

      if (node.value && astUtil.isFunctionLikeExpression(node.value)) {
        markPropTypesAsUsed(node.value);
      }
    });
  }

  return {
    VariableDeclarator(node) {
      if (isThisDotProps(node.init) && isInClassComponent(utils) && node.id.type === 'Identifier') {
        propVariables.set(node.id.name, []);
      }

      if (node.id.type !== 'ObjectPattern' || !node.init) {
        return;
      }

      const propsProperty = node.id.properties.find(property => (
        property.key &&
        (property.key.name === 'props' || property.key.value === 'props')
      ));
      if (node.init.type === 'ThisExpression' && propsProperty && propsProperty.value.type === 'ObjectPattern') {
        markPropTypesAsUsed(propsProperty.value);
        return;
      }

      if (node.init.type === 'ThisExpression' && propsProperty && propsProperty.value.name === 'props') {
        propVariables.set('props', []);
        return;
      }

      if (
        isCommonVariableNameForProps(node.init.name) &&
        (utils.getParentStatelessComponent() || isInLifeCycleMethod(node, checkAsyncSafeLifeCycles))
      ) {
        markPropTypesAsUsed(node.id);
        return;
      }

      if (isThisDotProps(node.init) && isInClassComponent(utils)) {
        markPropTypesAsUsed(node.id);
        return;
      }

      if (propVariables.get(node.init.name)) {
        markPropTypesAsUsed(node.id, propVariables.get(node.init.name));
      }
    },

    FunctionDeclaration: handleFunctionLikeExpressions,

    ArrowFunctionExpression: handleFunctionLikeExpressions,

    FunctionExpression: handleFunctionLikeExpressions,

    'FunctionDeclaration:exit': popScope,

    'ArrowFunctionExpression:exit': popScope,

    'FunctionExpression:exit': popScope,

    JSXSpreadAttribute(node) {
      const component = components.get(utils.getParentComponent());
      components.set(component ? component.node : node, {
        ignoreUnusedPropTypesValidation: true
      });
    },

    MemberExpression(node) {
      if (isPropTypesUsageByMemberExpression(node, context, utils, checkAsyncSafeLifeCycles)) {
        markPropTypesAsUsed(node);
        return;
      }

      if (propVariables.get(node.object.name)) {
        markPropTypesAsUsed(node, propVariables.get(node.object.name));
      }
    },

    ObjectPattern(node) {
      if (isNodeALifeCycleMethod(node.parent.parent, checkAsyncSafeLifeCycles) && node.properties.length > 0) {
        markPropTypesAsUsed(node.parent);
      }
    },

    'Program:exit': function () {
      const list = components.list();

      Object.keys(list).filter(component => mustBeValidated(list[component])).forEach((component) => {
        handleCustomValidators(list[component]);
      });
    }
  };
};
