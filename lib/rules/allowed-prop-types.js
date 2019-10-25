/**
 * @fileoverview Allows prop types to be used on top of forbidden validations.
 *               Reimplements https://github.com/yannickcr/eslint-plugin-react/blob/master/tests/lib/rules/forbid-prop-types.js
 * @author Luigi Perotti
 */
'use strict';

const variableUtil = require('../util/variable');
const propsUtil = require('../util/props');
const astUtil = require('../util/ast');
const propWrapperUtil = require('../util/propWrapper');

const FORBIDDEN_DEFAULTS = ['any', 'array', 'object'];
const ALLOWED_KEYS = [];

module.exports = {
    meta: {
        docs: {
            description: 'Forbid/Allow certain propTypes',
            category: 'Best Practices',
            recommended: true,
        },

        schema: [{
            type: 'object',
            properties: {
                allowed: {
                    type: 'array',
                    items: {
                        type: 'string'
                    }
                },
                forbid: {
                    type: 'array',
                    items: {
                        type: 'string'
                    }
                },
                checkContextTypes: {
                    type: 'boolean'
                },
                checkChildContextTypes: {
                    type: 'boolean'
                }
            },
            additionalProperties: true,
        }],
    },

    create(context) {
        const configuration = context.options[0] || {};
        const checkContextTypes = configuration.checkContextTypes || false;
        const checkChildContextTypes = configuration.checkChildContextTypes || false;

        function isForbidden(type) {
            const forbid = configuration.forbid || FORBIDDEN_DEFAULTS;
            return forbid.indexOf(type) >= 0;
        }

        function shouldCheckContextTypes(node) {
            return Boolean(checkContextTypes && propsUtil.isContextTypesDeclaration(node));
        }

        function shouldCheckChildContextTypes(node) {
            return Boolean(checkChildContextTypes && propsUtil.isChildContextTypesDeclaration(node));
        }

        function getValue(declaration) {
            let value = declaration.value;

            if (
                value.type === 'MemberExpression' &&
                value.property &&
                value.property.name &&
                value.property.name === 'isRequired'
            ) {
                value = value.object;
            }

            if (
                value.type === 'CallExpression' &&
                value.callee.type === 'MemberExpression'
            ) {
                value = value.callee;
            }

            return value;
        }

        function notAllowed(key) {
            const allowedKeys = [...configuration.allowed || [], ...ALLOWED_KEYS];

            const isAllowed = allowedKeys.some(matcher => (
                matcher instanceof RegExp
                    ? matcher.test(key)
                    : matcher === key
            ));

            return !isAllowed;
        }

        function checkProperties(declarations) {
            declarations.forEach((declaration) => {
                if (declaration.type !== 'Property') {
                    return;
                }

                let value = getValue(declaration);

                let target;
                if (value.property) {
                    target = value.property.name;
                } else if (value.type === 'Identifier') {
                    target = value.name;
                }

                const key = declaration.key.name;
                if (isForbidden(target) && notAllowed(key)) {
                    context.report({
                        node: declaration,
                        message: `Prop type \`${target}\` for key \'${key}\' is forbidden`,
                    });
                }
            });
        }

        function checkNode(node) {
            switch (node && node.type) {
                case 'ObjectExpression':
                    checkProperties(node.properties);
                    break;
                case 'Identifier': {
                    const propTypesObject = variableUtil.findVariableByName(context, node.name);
                    if (propTypesObject && propTypesObject.properties) {
                        checkProperties(propTypesObject.properties);
                    }
                    break;
                }
                case 'CallExpression': {
                    const innerNode = node.arguments && node.arguments[0];
                    if (propWrapperUtil.isPropWrapperFunction(context, context.getSource(node.callee)) && innerNode) {
                        checkNode(innerNode);
                    }
                    break;
                }
                default:
                    break;
            }
        }

        return {
            ClassProperty(node) {
                if (
                    !propsUtil.isPropTypesDeclaration(node) &&
                    !shouldCheckContextTypes(node) &&
                    !shouldCheckChildContextTypes(node)
                ) {
                    return;
                }
                checkNode(node.value);
            },

            MemberExpression(node) {
                if (
                    !propsUtil.isPropTypesDeclaration(node) &&
                    !shouldCheckContextTypes(node) &&
                    !shouldCheckChildContextTypes(node)
                ) {
                    return;
                }

                checkNode(node.parent.right);
            },

            MethodDefinition(node) {
                if (
                    !propsUtil.isPropTypesDeclaration(node) &&
                    !shouldCheckContextTypes(node) &&
                    !shouldCheckChildContextTypes(node)
                ) {
                    return;
                }

                const returnStatement = astUtil.findReturnStatement(node);

                if (returnStatement && returnStatement.argument) {
                    checkNode(returnStatement.argument);
                }
            },

            ObjectExpression(node) {
                node.properties.forEach((property) => {
                    if (!property.key) {
                        return;
                    }

                    if (
                        !propsUtil.isPropTypesDeclaration(property) &&
                        !shouldCheckContextTypes(property) &&
                        !shouldCheckChildContextTypes(property)
                    ) {
                        return;
                    }
                    if (property.value.type === 'ObjectExpression') {
                        checkProperties(property.value.properties);
                    }
                });
            }
        };
    }
};
