'use strict';

const annotations = require('./annotations');
const propsUtil = require('./props');
const variableUtil = require('./variable');
const versionUtil = require('./version');
const propWrapperUtil = require('./propWrapper');
const getKeyValue = require('./ast').getKeyValue;

function isSuperTypeParameterPropsDeclaration(node) {
  if (node && (node.type === 'ClassDeclaration' || node.type === 'ClassExpression')) {
    if (node.superTypeParameters && node.superTypeParameters.params.length > 0) {
      return true;
    }
  }
  return false;
}

function iterateProperties(context, properties, fn) {
  if (properties && properties.length && typeof fn === 'function') {
    for (let i = 0, j = properties.length; i < j; i++) {
      const node = properties[i];
      const key = getKeyValue(context, node);

      const value = node.value;
      fn(key, value, node);
    }
  }
}

function isInsideClassBody(node) {
  let parent = node.parent;
  while (parent) {
    if (parent.type === 'ClassBody') {
      return true;
    }
    parent = parent.parent;
  }

  return false;
}

module.exports = function propTypesInstructions(context, components, utils) {
  let stack = null;

  const classExpressions = [];
  const defaults = {customValidators: []};
  const configuration = Object.assign({}, defaults, context.options[0] || {});
  const customValidators = configuration.customValidators;

  function typeScope() {
    return stack[stack.length - 1];
  }

  function getInTypeScope(key) {
    return stack[stack.length - 1][key];
  }

  function setInTypeScope(key, value) {
    stack[stack.length - 1][key] = value;
    return value;
  }

  function hasCustomValidator(validator) {
    return customValidators.indexOf(validator) !== -1;
  }

  const typeDeclarationBuilders = {
    GenericTypeAnnotation(annotation, parentName, seen) {
      if (getInTypeScope(annotation.id.name)) {
        return buildTypeAnnotationDeclarationTypes(getInTypeScope(annotation.id.name), parentName, seen);
      }
      return {};
    },

    ObjectTypeAnnotation(annotation, parentName, seen) {
      let containsObjectTypeSpread = false;
      const containsIndexers = Boolean(annotation.indexers && annotation.indexers.length);
      const shapeTypeDefinition = {
        type: 'shape',
        children: {}
      };
      iterateProperties(context, annotation.properties, (childKey, childValue, propNode) => {
        const fullName = [parentName, childKey].join('.');
        if (!childKey && !childValue) {
          containsObjectTypeSpread = true;
        } else {
          const types = buildTypeAnnotationDeclarationTypes(childValue, fullName, seen);
          types.fullName = fullName;
          types.name = childKey;
          types.node = propNode;
          types.isRequired = !childValue.optional;
          shapeTypeDefinition.children[childKey] = types;
        }
      });

      shapeTypeDefinition.containsSpread = containsObjectTypeSpread;
      shapeTypeDefinition.containsIndexers = containsIndexers;

      return shapeTypeDefinition;
    },

    UnionTypeAnnotation(annotation, parentName, seen) {
      const unionTypeDefinition = {
        type: 'union',
        children: []
      };
      for (let i = 0, j = annotation.types.length; i < j; i++) {
        const type = buildTypeAnnotationDeclarationTypes(annotation.types[i], parentName, seen);
        if (type.type) {
          if (type.children === true) {
            unionTypeDefinition.children = true;
            return unionTypeDefinition;
          }
        }

        (unionTypeDefinition.children).push(type);
      }
      if ((unionTypeDefinition.children).length === 0) {
        return {};
      }
      return unionTypeDefinition;
    },

    ArrayTypeAnnotation(annotation, parentName, seen) {
      const fullName = [parentName, '*'].join('.');
      const child = buildTypeAnnotationDeclarationTypes(annotation.elementType, fullName, seen);
      child.fullName = fullName;
      child.name = '__ANY_KEY__';
      child.node = annotation;
      return {
        type: 'object',
        children: {
          __ANY_KEY__: child
        }
      };
    }
  };

  function resolveTypeAnnotation(node) {
    let annotation = (node.left && node.left.typeAnnotation) || node.typeAnnotation || node;
    while (annotation && (annotation.type === 'TypeAnnotation' || annotation.type === 'NullableTypeAnnotation')) {
      annotation = annotation.typeAnnotation;
    }
    if (annotation.type === 'GenericTypeAnnotation' && getInTypeScope(annotation.id.name)) {
      return getInTypeScope(annotation.id.name);
    }

    return annotation;
  }

  function buildTypeAnnotationDeclarationTypes(annotation, parentName, seen) {
    if (typeof seen === 'undefined') {
      seen = new Set();
    }
    if (seen.has(annotation)) {
      return {};
    }
    seen.add(annotation);

    if (annotation.type in typeDeclarationBuilders) {
      return typeDeclarationBuilders[annotation.type](annotation, parentName, seen);
    }
    return {};
  }

  function declarePropTypesForObjectTypeAnnotation(propTypes, declaredPropTypes) {
    let ignorePropsValidation = false;

    iterateProperties(context, propTypes.properties, (key, value, propNode) => {
      if (!value) {
        ignorePropsValidation = true;
        return;
      }

      const types = buildTypeAnnotationDeclarationTypes(value, key);
      types.fullName = key;
      types.name = key;
      types.node = propNode;
      types.isRequired = !propNode.optional;
      declaredPropTypes[key] = types;
    });

    return ignorePropsValidation;
  }

  function declarePropTypesForIntersectionTypeAnnotation(propTypes, declaredPropTypes) {
    return propTypes.types.some((annotation) => {
      if (annotation.type === 'ObjectTypeAnnotation') {
        return declarePropTypesForObjectTypeAnnotation(annotation, declaredPropTypes);
      }

      if (annotation.type === 'UnionTypeAnnotation') {
        return true;
      }

      if (!annotation.id) {
        return true;
      }

      const typeNode = getInTypeScope(annotation.id.name);

      if (!typeNode) {
        return true;
      }
      if (typeNode.type === 'IntersectionTypeAnnotation') {
        return declarePropTypesForIntersectionTypeAnnotation(typeNode, declaredPropTypes);
      }

      return declarePropTypesForObjectTypeAnnotation(typeNode, declaredPropTypes);
    });
  }

  function buildReactDeclarationTypes(value, parentName) {
    if (
      value &&
      value.callee &&
      value.callee.object &&
      hasCustomValidator(value.callee.object.name)
    ) {
      return {};
    }

    if (
      value &&
      value.type === 'MemberExpression' &&
      value.property &&
      value.property.name &&
      value.property.name === 'isRequired'
    ) {
      value = value.object;
    }

    if (
      value &&
      value.type === 'CallExpression' &&
      value.callee &&
      value.callee.property &&
      value.callee.property.name &&
      value.arguments &&
      value.arguments.length > 0
    ) {
      const callName = value.callee.property.name;
      const argument = value.arguments[0];
      switch (callName) {
        case 'shape': {
          if (argument.type !== 'ObjectExpression') {
            return {};
          }
          const shapeTypeDefinition = {
            type: 'shape',
            children: {}
          };
          iterateProperties(context, argument.properties, (childKey, childValue, propNode) => {
            if (childValue) {
              const fullName = [parentName, childKey].join('.');
              const types = buildReactDeclarationTypes(childValue, fullName);
              types.fullName = fullName;
              types.name = childKey;
              types.node = propNode;
              shapeTypeDefinition.children[childKey] = types;
            }
          });
          return shapeTypeDefinition;
        }
        case 'arrayOf':
        case 'objectOf': {
          const fullName = [parentName, '*'].join('.');
          const child = buildReactDeclarationTypes(argument, fullName);
          child.fullName = fullName;
          child.name = '__ANY_KEY__';
          child.node = argument;
          return {
            type: 'object',
            children: {
              __ANY_KEY__: child
            }
          };
        }
        case 'oneOfType': {
          if (
            !argument.elements ||
            !argument.elements.length
          ) {
            return {};
          }

          const unionTypeDefinition = {
            type: 'union',
            children: []
          };
          for (let i = 0, j = argument.elements.length; i < j; i++) {
            const type = buildReactDeclarationTypes(argument.elements[i], parentName);
            if (type.type) {
              if (type.children === true) {
                unionTypeDefinition.children = true;
                return unionTypeDefinition;
              }
            }
          }
          if ((unionTypeDefinition.children).length === 0) {
            return {};
          }
          return unionTypeDefinition;
        }
        case 'instanceOf':
          return {
            type: 'instance',
            children: true
          };
        case 'oneOf':
        default:
          return {};
      }
    }
    return {};
  }

  function markPropTypesAsDeclared(node, propTypes) {
    let componentNode = node;
    while (componentNode && !components.get(componentNode)) {
      componentNode = componentNode.parent;
    }
    const component = components.get(componentNode);
    const declaredPropTypes = component && component.declaredPropTypes || {};
    let ignorePropsValidation = component && component.ignorePropsValidation || false;
    switch (propTypes && propTypes.type) {
      case 'ObjectTypeAnnotation':
        ignorePropsValidation = declarePropTypesForObjectTypeAnnotation(propTypes, declaredPropTypes);
        break;
      case 'ObjectExpression':
        iterateProperties(context, propTypes.properties, (key, value, propNode) => {
          if (!value) {
            ignorePropsValidation = true;
            return;
          }
          const types = buildReactDeclarationTypes(value, key);
          types.fullName = key;
          types.name = key;
          types.node = propNode;
          types.isRequired = propsUtil.isRequiredPropType(value);
          declaredPropTypes[key] = types;
        });
        break;
      case 'MemberExpression': {
        let curDeclaredPropTypes = declaredPropTypes;
        while (
          propTypes &&
          propTypes.parent &&
          propTypes.parent.type !== 'AssignmentExpression' &&
          propTypes.property &&
          curDeclaredPropTypes
        ) {
          const propName = propTypes.property.name;
          if (propName in curDeclaredPropTypes) {
            curDeclaredPropTypes = curDeclaredPropTypes[propName].children;
            propTypes = propTypes.parent;
          } else {
            propTypes = null;
          }
        }
        if (propTypes && propTypes.parent && propTypes.property) {
          if (!(propTypes === propTypes.parent.left && propTypes.parent.left.object)) {
            ignorePropsValidation = true;
            break;
          }
          const parentProp = context.getSource(propTypes.parent.left.object).replace(/^.*\.propTypes\./, '');
          const types = buildReactDeclarationTypes(
            propTypes.parent.right,
            parentProp
          );

          types.name = propTypes.property.name;
          types.fullName = [parentProp, propTypes.property.name].join('.');
          types.node = propTypes.parent;
          types.isRequired = propsUtil.isRequiredPropType(propTypes.parent.right);
          curDeclaredPropTypes[propTypes.property.name] = types;
        } else {
          let isUsedInPropTypes = false;
          let n = propTypes;
          while (n) {
            if (n.type === 'AssignmentExpression' && propsUtil.isPropTypesDeclaration(n.left) ||
              (n.type === 'ClassProperty' || n.type === 'Property') && propsUtil.isPropTypesDeclaration(n)) {
              isUsedInPropTypes = true;
              break;
            }
            n = n.parent;
          }
          if (!isUsedInPropTypes) {
            ignorePropsValidation = true;
          }
        }
        break;
      }
      case 'Identifier': {
        const variablesInScope = variableUtil.variablesInScope(context);
        const firstMatchingVariable = variablesInScope
          .find(variableInScope => variableInScope.name === propTypes.name);
        if (firstMatchingVariable) {
          const defInScope = firstMatchingVariable.defs[firstMatchingVariable.defs.length - 1];
          markPropTypesAsDeclared(node, defInScope.node && defInScope.node.init);
          return;
        }
        ignorePropsValidation = true;
        break;
      }
      case 'CallExpression': {
        if (
          propWrapperUtil.isPropWrapperFunction(
            context,
            context.getSourceCode().getText(propTypes.callee)
          ) &&
          propTypes.arguments && propTypes.arguments[0]
        ) {
          markPropTypesAsDeclared(node, propTypes.arguments[0]);
          return;
        }
        break;
      }
      case 'IntersectionTypeAnnotation':
        ignorePropsValidation = declarePropTypesForIntersectionTypeAnnotation(propTypes, declaredPropTypes);
        break;
      case 'GenericTypeAnnotation':
        if (propTypes.id.name === '$ReadOnly') {
          ignorePropsValidation = declarePropTypesForObjectTypeAnnotation(
            propTypes.typeParameters.params[0],
            declaredPropTypes
          );
        } else {
          ignorePropsValidation = true;
        }
        break;
      case null:
        break;
      default:
        ignorePropsValidation = true;
        break;
    }

    components.set(node, {
      declaredPropTypes,
      ignorePropsValidation
    });
  }

  function markAnnotatedFunctionArgumentsAsDeclared(node) {
    if (!node.params || !node.params.length || !annotations.isAnnotatedFunctionPropsDeclaration(node, context)) {
      return;
    }

    if (isInsideClassBody(node)) {
      return;
    }

    const param = node.params[0];
    if (param.typeAnnotation && param.typeAnnotation.typeAnnotation && param.typeAnnotation.typeAnnotation.type === 'UnionTypeAnnotation') {
      param.typeAnnotation.typeAnnotation.types.forEach((annotation) => {
        if (annotation.type === 'GenericTypeAnnotation') {
          markPropTypesAsDeclared(node, resolveTypeAnnotation(annotation));
        } else {
          markPropTypesAsDeclared(node, annotation);
        }
      });
    } else {
      markPropTypesAsDeclared(node, resolveTypeAnnotation(param));
    }
  }

  function resolveSuperParameterPropsType(node) {
    let propsParameterPosition;
    try {
      propsParameterPosition = versionUtil.testFlowVersion(context, '0.53.0') ? 0 : 1;
    } catch (e) {
      propsParameterPosition = node.superTypeParameters.params.length <= 2 ? 0 : 1;
    }

    let annotation = node.superTypeParameters.params[propsParameterPosition];
    while (annotation && (annotation.type === 'TypeAnnotation' || annotation.type === 'NullableTypeAnnotation')) {
      annotation = annotation.typeAnnotation;
    }

    if (annotation && annotation.type === 'GenericTypeAnnotation' && getInTypeScope(annotation.id.name)) {
      return getInTypeScope(annotation.id.name);
    }
    return annotation;
  }

  function isAnnotatedClassPropsDeclaration(node) {
    if (node && node.type === 'ClassProperty') {
      const tokens = context.getFirstTokens(node, 2);
      if (
        node.typeAnnotation && (
          tokens[0].value === 'props' ||
          (tokens[1] && tokens[1].value === 'props')
        )
      ) {
        return true;
      }
    }
    return false;
  }

  return {
    ClassExpression(node) {
      classExpressions.push(node);
    },

    ClassDeclaration(node) {
      if (isSuperTypeParameterPropsDeclaration(node)) {
        markPropTypesAsDeclared(node, resolveSuperParameterPropsType(node));
      }
    },

    ClassProperty(node) {
      if (isAnnotatedClassPropsDeclaration(node)) {
        markPropTypesAsDeclared(node, resolveTypeAnnotation(node));
      } else if (propsUtil.isPropTypesDeclaration(node)) {
        markPropTypesAsDeclared(node, node.value);
      }
    },

    ObjectExpression(node) {
      node.properties.forEach((property) => {
        if (!propsUtil.isPropTypesDeclaration(property)) {
          return;
        }
        markPropTypesAsDeclared(node, property.value);
      });
    },

    FunctionExpression(node) {
      if (node.parent.type !== 'MethodDefinition') {
        markAnnotatedFunctionArgumentsAsDeclared(node);
      }
    },

    FunctionDeclaration: markAnnotatedFunctionArgumentsAsDeclared,

    ArrowFunctionExpression: markAnnotatedFunctionArgumentsAsDeclared,

    MemberExpression(node) {
      if (propsUtil.isPropTypesDeclaration(node)) {
        const component = utils.getRelatedComponent(node);
        if (!component) {
          return;
        }
        markPropTypesAsDeclared(component.node, node.parent.right || node.parent);
      }
    },

    MethodDefinition(node) {
      if (!node.static || node.kind !== 'get' || !propsUtil.isPropTypesDeclaration(node)) {
        return;
      }

      let i = node.value.body.body.length - 1;
      for (; i >= 0; i--) {
        if (node.value.body.body[i].type === 'ReturnStatement') {
          break;
        }
      }

      if (i >= 0) {
        markPropTypesAsDeclared(node, node.value.body.body[i].argument);
      }
    },

    TypeAlias(node) {
      setInTypeScope(node.id.name, node.right);
    },

    TypeParameterDeclaration(node) {
      const identifier = node.params[0];

      if (identifier.typeAnnotation) {
        setInTypeScope(identifier.name, identifier.typeAnnotation.typeAnnotation);
      }
    },

    Program() {
      stack = [{}];
    },

    BlockStatement() {
      stack.push(Object.create(typeScope()));
    },

    'BlockStatement:exit': function () {
      stack.pop();
    },

    'Program:exit': function () {
      classExpressions.forEach((node) => {
        if (isSuperTypeParameterPropsDeclaration(node)) {
          markPropTypesAsDeclared(node, resolveSuperParameterPropsType(node));
        }
      });
    }
  };
};
