'use strict';

const doctrine = require('doctrine');
const arrayIncludes = require('array-includes');
const values = require('object.values');

const variableUtil = require('./variable');
const pragmaUtil = require('./pragma');
const astUtil = require('./ast');
const propTypesUtil = require('./propTypes');
const jsxUtil = require('./jsx');
const usedPropTypesUtil = require('./usedPropTypes');
const defaultPropsUtil = require('./defaultProps');

function getId(node) {
  return node && node.range.join(':');
}

function usedPropTypesAreEquivalent(propA, propB) {
  if (propA.name === propB.name) {
    if (!propA.allNames && !propB.allNames) {
      return true;
    }
    if (Array.isArray(propA.allNames) && Array.isArray(propB.allNames) && propA.allNames.join('') === propB.allNames.join('')) {
      return true;
    }
    return false;
  }
  return false;
}

function mergeUsedPropTypes(propsList, newPropsList) {
  const propsToAdd = [];
  newPropsList.forEach((newProp) => {
    const newPropisAlreadyInTheList = propsList.some(prop => usedPropTypesAreEquivalent(prop, newProp));
    if (!newPropisAlreadyInTheList) {
      propsToAdd.push(newProp);
    }
  });

  return propsList.concat(propsToAdd);
}

const Lists = new WeakMap();


class Components {
  constructor() {
    Lists.set(this, {});
  }

  add(node, confidence) {
    const id = getId(node);
    const list = Lists.get(this);
    if (list[id]) {
      if (confidence === 0 || list[id].confidence === 0) {
        list[id].confidence = 0;
      } else {
        list[id].confidence = Math.max(list[id].confidence, confidence);
      }
      return list[id];
    }
    list[id] = {
      node,
      confidence
    };
    return list[id];
  }

  get(node) {
    const id = getId(node);
    const item = Lists.get(this)[id];
    if (item && item.confidence >= 1) {
      return item;
    }
    return null;
  }

  set(node, props) {
    const list = Lists.get(this);
    let component = list[getId(node)];
    while (!component) {
      node = node.parent;
      if (!node) {
        return;
      }
      component = list[getId(node)];
    }

    Object.assign(
      component,
      props,
      {
        usedPropTypes: mergeUsedPropTypes(
          component.usedPropTypes || [],
          props.usedPropTypes || []
        )
      }
    );
  }

  list() {
    const thisList = Lists.get(this);
    const list = {};
    const usedPropTypes = {};

    Object.keys(thisList).filter(i => thisList[i].confidence < 2).forEach((i) => {
      let component = null;
      let node = null;
      node = thisList[i].node;
      while (!component && node.parent) {
        node = node.parent;
        if (node.type === 'Decorator') {
          break;
        }
        component = this.get(node);
      }
      if (component) {
        const newUsedProps = (thisList[i].usedPropTypes || []).filter(propType => !propType.node || propType.node.kind !== 'init');

        const componentId = getId(component.node);

        usedPropTypes[componentId] = mergeUsedPropTypes(usedPropTypes[componentId] || [], newUsedProps);
      }
    });

    Object.keys(thisList).filter(j => thisList[j].confidence >= 2).forEach((j) => {
      const id = getId(thisList[j].node);
      list[j] = thisList[j];
      if (usedPropTypes[id]) {
        list[j].usedPropTypes = mergeUsedPropTypes(list[j].usedPropTypes || [], usedPropTypes[id]);
      }
    });
    return list;
  }

  length() {
    const list = Lists.get(this);
    return Object.keys(list).filter(i => list[i].confidence >= 2).length;
  }
}

function componentRule(rule, context) {
  const createClass = pragmaUtil.getCreateClassFromContext(context);
  const pragma = pragmaUtil.getFromContext(context);
  const sourceCode = context.getSourceCode();
  const components = new Components();

  const utils = {

    isES5Component(node) {
      if (!node.parent) {
        return false;
      }
      return new RegExp(`^(${pragma}\\.)?${createClass}$`).test(sourceCode.getText(node.parent.callee));
    },

    isES6Component(node) {
      if (utils.isExplicitComponent(node)) {
        return true;
      }

      if (!node.superClass) {
        return false;
      }
      return new RegExp(`^(${pragma}\\.)?(Pure)?Component$`).test(sourceCode.getText(node.superClass));
    },

    isExplicitComponent(node) {
      let comment;

      try {
        comment = sourceCode.getJSDocComment(node);
      } catch (e) {
        comment = null;
      }

      if (comment === null) {
        return false;
      }

      const commentAst = doctrine.parse(comment.value, {
        unwrap: true,
        tags: ['extends', 'augments']
      });

      const relevantTags = commentAst.tags.filter(tag => tag.name === 'React.Component' || tag.name === 'React.PureComponent');

      return relevantTags.length > 0;
    },

    isPureComponent(node) {
      if (node.superClass) {
        return new RegExp(`^(${pragma}\\.)?PureComponent$`).test(sourceCode.getText(node.superClass));
      }
      return false;
    },

    isDestructuredFromPragmaImport(variable) {
      const variables = variableUtil.variablesInScope(context);
      const variableInScope = variableUtil.getVariable(variables, variable);
      if (variableInScope) {
        const map = variableInScope.scope.set;
        return map.has(pragma);
      }
      return false;
    },

    isCreateElement(node) {
      const calledOnPragma = (
        node &&
        node.callee &&
        node.callee.object &&
        node.callee.object.name === pragma &&
        node.callee.property &&
        node.callee.property.name === 'createElement'
      );

      const calledDirectly = (
        node &&
        node.callee &&
        node.callee.name === 'createElement'
      );

      if (this.isDestructuredFromPragmaImport('createElement')) {
        return calledDirectly || calledOnPragma;
      }
      return calledOnPragma;
    },

    inConstructor() {
      let scope = context.getScope();
      while (scope) {
        if (scope.block && scope.block.parent && scope.block.parent.kind === 'constructor') {
          return true;
        }
        scope = scope.upper;
      }
      return false;
    },

    isStateMemberExpression(node) {
      return node.type === 'MemberExpression' && node.object.type === 'ThisExpression' && node.property.name === 'state';
    },

    getReturnPropertyAndNode(ASTnode) {
      let property;
      let node = ASTnode;
      switch (node.type) {
        case 'ReturnStatement':
          property = 'argument';
          break;
        case 'ArrowFunctionExpression':
          property = 'body';
          if (node[property] && node[property].type === 'BlockStatement') {
            node = utils.findReturnStatement(node);
            property = 'argument';
          }
          break;
        default:
          node = utils.findReturnStatement(node);
          property = 'argument';
      }
      return {
        node,
        property
      };
    },

    isReturningJSX(ASTnode, strict) {
      const nodeAndProperty = utils.getReturnPropertyAndNode(ASTnode);
      const node = nodeAndProperty.node;
      const property = nodeAndProperty.property;

      if (!node) {
        return false;
      }

      const returnsConditionalJSXConsequent = node[property] &&
        node[property].type === 'ConditionalExpression' &&
        jsxUtil.isJSX(node[property].consequent);
      const returnsConditionalJSXAlternate = node[property] &&
        node[property].type === 'ConditionalExpression' &&
        jsxUtil.isJSX(node[property].alternate);
      const returnsConditionalJSX = strict ?
        (returnsConditionalJSXConsequent && returnsConditionalJSXAlternate) :
        (returnsConditionalJSXConsequent || returnsConditionalJSXAlternate);

      const returnsJSX = node[property] &&
        jsxUtil.isJSX(node[property]);
      const returnsPragmaCreateElement = this.isCreateElement(node[property]);

      return Boolean(
        returnsConditionalJSX ||
        returnsJSX ||
        returnsPragmaCreateElement
      );
    },

    isReturningNull(ASTnode) {
      const nodeAndProperty = utils.getReturnPropertyAndNode(ASTnode);
      const property = nodeAndProperty.property;
      const node = nodeAndProperty.node;

      if (!node) {
        return false;
      }

      return node[property] && node[property].value === null;
    },

    isReturningJSXOrNull(ASTNode, strict) {
      return utils.isReturningJSX(ASTNode, strict) || utils.isReturningNull(ASTNode);
    },

    getPragmaComponentWrapper(node) {
      let isPragmaComponentWrapper;
      let currentNode = node;
      let prevNode;
      do {
        currentNode = currentNode.parent;
        isPragmaComponentWrapper = this.isPragmaComponentWrapper(currentNode);
        if (isPragmaComponentWrapper) {
          prevNode = currentNode;
        }
      } while (isPragmaComponentWrapper);

      return prevNode;
    },

    getComponentNameFromJSXElement(node) {
      if (node.type !== 'JSXElement') {
        return null;
      }
      if (node.openingElement && node.openingElement.name && node.openingElement.name.name) {
        return node.openingElement.name.name;
      }
      return null;
    },

    getNameOfWrappedComponent(node) {
      if (node.length < 1) {
        return null;
      }
      const body = node[0].body;
      if (!body) {
        return null;
      }
      if (body.type === 'JSXElement') {
        return this.getComponentNameFromJSXElement(body);
      }
      if (body.type === 'BlockStatement') {
        const jsxElement = body.body.find(item => item.type === 'ReturnStatement');
        return jsxElement && this.getComponentNameFromJSXElement(jsxElement.argument);
      }
      return null;
    },

    getDetectedComponents() {
      const list = components.list();
      return values(list).filter((val) => {
        if (val.node.type === 'ClassDeclaration') {
          return true;
        }
        if (
          val.node.type === 'ArrowFunctionExpression' &&
          val.node.parent &&
          val.node.parent.type === 'VariableDeclarator' &&
          val.node.parent.id
        ) {
          return true;
        }
        return false;
      }).map((val) => {
        if (val.node.type === 'ArrowFunctionExpression') return val.node.parent.id.name;
        return val.node.id.name;
      });
    },

    nodeWrapsComponent(node) {
      const childComponent = this.getNameOfWrappedComponent(node.arguments);
      const componentList = this.getDetectedComponents();
      return !!childComponent && arrayIncludes(componentList, childComponent);
    },

    isPragmaComponentWrapper(node) {
      if (!node || node.type !== 'CallExpression') {
        return false;
      }
      const propertyNames = ['forwardRef', 'memo'];
      const calleeObject = node.callee.object;
      if (calleeObject && node.callee.property) {
        return arrayIncludes(propertyNames, node.callee.property.name) &&
          calleeObject.name === pragma &&
          !this.nodeWrapsComponent(node);
      }
      return arrayIncludes(propertyNames, node.callee.name) && this.isDestructuredFromPragmaImport(node.callee.name);
    },

    findReturnStatement: astUtil.findReturnStatement,

    getParentComponent() {
      return (
        utils.getParentES6Component() ||
        utils.getParentES5Component() ||
        utils.getParentStatelessComponent()
      );
    },

    getParentES5Component() {
      let scope = context.getScope();
      while (scope) {
        const node = scope.block && scope.block.parent && scope.block.parent.parent;
        if (node && utils.isES5Component(node)) {
          return node;
        }
        scope = scope.upper;
      }
      return null;
    },

    getParentES6Component() {
      let scope = context.getScope();
      while (scope && scope.type !== 'class') {
        scope = scope.upper;
      }
      const node = scope && scope.block;
      if (!node || !utils.isES6Component(node)) {
        return null;
      }
      return node;
    },

    isInAllowedPositionForComponent(node) {
      switch (node.parent.type) {
        case 'VariableDeclarator':
        case 'AssignmentExpression':
        case 'Property':
        case 'ReturnStatement':
        case 'ExportDefaultDeclaration': {
          return true;
        }
        case 'SequenceExpression': {
          return utils.isInAllowedPositionForComponent(node.parent) &&
            node === node.parent.expressions[node.parent.expressions.length - 1];
        }
        default:
          return false;
      }
    },

    getStatelessComponent(node) {
      if (node.type === 'FunctionDeclaration') {
        if (utils.isReturningJSXOrNull(node)) {
          return node;
        }
      }

      if (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
        if (utils.isInAllowedPositionForComponent(node) && utils.isReturningJSXOrNull(node)) {
          return node;
        }

        const pragmaComponentWrapper = utils.getPragmaComponentWrapper(node);
        if (pragmaComponentWrapper) {
          return pragmaComponentWrapper;
        }
      }

      return undefined;
    },

    getParentStatelessComponent() {
      let scope = context.getScope();
      while (scope) {
        const node = scope.block;
        const statelessComponent = utils.getStatelessComponent(node);
        if (statelessComponent) {
          return statelessComponent;
        }
        scope = scope.upper;
      }
      return null;
    },

    getRelatedComponent(node) {
      let i;
      let j;
      let k;
      let l;
      let componentNode;
      const componentPath = [];
      while (node) {
        if (node.property && node.property.type === 'Identifier') {
          componentPath.push(node.property.name);
        }
        if (node.object && node.object.type === 'Identifier') {
          componentPath.push(node.object.name);
        }
        node = node.object;
      }
      componentPath.reverse();
      const componentName = componentPath.slice(0, componentPath.length - 1).join('.');

      const variableName = componentPath.shift();
      if (!variableName) {
        return null;
      }
      let variableInScope;
      const variables = variableUtil.variablesInScope(context);
      for (i = 0, j = variables.length; i < j; i++) {
        if (variables[i].name === variableName) {
          variableInScope = variables[i];
          break;
        }
      }
      if (!variableInScope) {
        return null;
      }

      const refs = variableInScope.references;
      refs.some((ref) => {
        let refId = ref.identifier;
        if (refId.parent && refId.parent.type === 'MemberExpression') {
          refId = refId.parent;
        }
        if (sourceCode.getText(refId) !== componentName) {
          return false;
        }
        if (refId.type === 'MemberExpression') {
          componentNode = refId.parent.right;
        } else if (
          refId.parent &&
          refId.parent.type === 'VariableDeclarator' &&
          refId.parent.init &&
          refId.parent.init.type !== 'Identifier'
        ) {
          componentNode = refId.parent.init;
        }
        return true;
      });

      if (componentNode) {
        return components.add(componentNode, 1);
      }

      const defs = variableInScope.defs;
      const defInScope = defs.find(def => (
        def.type === 'ClassName' ||
        def.type === 'FunctionName' ||
        def.type === 'Variable'
      ));
      if (!defInScope || !defInScope.node) {
        return null;
      }
      componentNode = defInScope.node.init || defInScope.node;

      for (i = 0, j = componentPath.length; i < j; i++) {
        if (!componentNode.properties) {
          continue;
        }
        for (k = 0, l = componentNode.properties.length; k < l; k++) {
          if (componentNode.properties[k].key && componentNode.properties[k].key.name === componentPath[i]) {
            componentNode = componentNode.properties[k];
            break;
          }
        }
        if (!componentNode || !componentNode.value) {
          return null;
        }
        componentNode = componentNode.value;
      }

      return components.add(componentNode, 1);
    }
  };

  const detectionInstructions = {
    CallExpression(node) {
      if (!utils.isPragmaComponentWrapper(node)) {
        return;
      }
      if (node.arguments.length > 0 && astUtil.isFunctionLikeExpression(node.arguments[0])) {
        components.add(node, 2);
      }
    },

    ClassExpression(node) {
      if (!utils.isES6Component(node)) {
        return;
      }
      components.add(node, 2);
    },

    ClassDeclaration(node) {
      if (!utils.isES6Component(node)) {
        return;
      }
      components.add(node, 2);
    },

    ClassProperty(node) {
      node = utils.getParentComponent();
      if (!node) {
        return;
      }
      components.add(node, 2);
    },

    ObjectExpression(node) {
      if (!utils.isES5Component(node)) {
        return;
      }
      components.add(node, 2);
    },

    FunctionExpression(node) {
      if (node.async) {
        components.add(node, 0);
        return;
      }
      const component = utils.getParentComponent();
      if (
        !component ||
        (component.parent && component.parent.type === 'JSXExpressionContainer')
      ) {
        components.add(node, 0);
        return;
      }
      components.add(component, 1);
    },

    FunctionDeclaration(node) {
      if (node.async) {
        components.add(node, 0);
        return;
      }
      node = utils.getParentComponent();
      if (!node) {
        return;
      }
      components.add(node, 1);
    },

    ArrowFunctionExpression(node) {
      if (node.async) {
        components.add(node, 0);
        return;
      }
      const component = utils.getParentComponent();
      if (
        !component ||
        (component.parent && component.parent.type === 'JSXExpressionContainer')
      ) {
        components.add(node, 0);
        return;
      }
      if (component.expression && utils.isReturningJSX(component)) {
        components.add(component, 2);
      } else {
        components.add(component, 1);
      }
    },

    ThisExpression(node) {
      const component = utils.getParentComponent();
      if (!component || !/Function/.test(component.type) || !node.parent.property) {
        return;
      }
      components.add(node, 0);
    },

    ReturnStatement(node) {
      if (!utils.isReturningJSX(node)) {
        return;
      }
      node = utils.getParentComponent();
      if (!node) {
        const scope = context.getScope();
        components.add(scope.block, 1);
        return;
      }
      components.add(node, 2);
    }
  };

  const ruleInstructions = rule(context, components, utils);
  const updatedRuleInstructions = Object.assign({}, ruleInstructions);
  const propTypesInstructions = propTypesUtil(context, components, utils);
  const usedPropTypesInstructions = usedPropTypesUtil(context, components, utils);
  const defaultPropsInstructions = defaultPropsUtil(context, components, utils);
  const allKeys = new Set(Object.keys(detectionInstructions).concat(
    Object.keys(propTypesInstructions),
    Object.keys(usedPropTypesInstructions),
    Object.keys(defaultPropsInstructions)
  ));

  allKeys.forEach((instruction) => {
    updatedRuleInstructions[instruction] = function (node) {
      if (instruction in detectionInstructions) {
        detectionInstructions[instruction](node);
      }
      if (instruction in propTypesInstructions) {
        propTypesInstructions[instruction](node);
      }
      if (instruction in usedPropTypesInstructions) {
        usedPropTypesInstructions[instruction](node);
      }
      if (instruction in defaultPropsInstructions) {
        defaultPropsInstructions[instruction](node);
      }
      if (ruleInstructions[instruction]) {
        return ruleInstructions[instruction](node);
      }
    };
  });

  return updatedRuleInstructions;
}

module.exports = Object.assign(Components, {
  detect(rule) {
    return componentRule.bind(this, rule);
  }
});
