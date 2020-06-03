'use strict';

const DEFAULT_DEPTH_ALLOWED = 0;
const getMaxDepthMessage = ({ depthAllowed, depth }) =>
    `Prefer absolute imports for nesting over depth ${depthAllowed}. Found depth ${depth}`;
const INVALID_PATH_MESSAGE = 'Invalid path access. Don\'t use relative imports within path string';
const invalidPathError = new Error('Wrong value provided to depthAllowed. Value must be a positive int');

module.exports = {
    meta: {
        docs: {
            description: 'Enforces absolute import from downward folders',
            category: 'Best Practices',
            recommended: true,
        },
        schema: [{
            type: 'object',
            properties: {
                depthAllowed: {
                    type: 'number'
                },
            },
            additionalProperties: true,
        }],
    },

    create(context) {
        const configuration = context.options[0] || {};
        const depthAllowed = configuration.depthAllowed || DEFAULT_DEPTH_ALLOWED;

        function pathValidity(path) {
            if (path) {
                if (typeof depthAllowed !== 'number' || depthAllowed % 1 > 0 || depthAllowed < 0) {
                    throw invalidPathError;
                }

                // Matches backing paths in the middle of the declaration
                // e.g. import a from './a/b/../c';
                const disallowedPathAccess = /\w+\/\.\.\//;
                if (disallowedPathAccess.test(path)) {
                    return { isInvalid: true, message: INVALID_PATH_MESSAGE };
                }

                // Matches on imports that have more nesting access than allowed
                // e.g.
                // depthAllowed: 2
                // import a from '../../../asd' is invalid
                // import a from '../../dsa' is valid
                const depthMatches = path.match(new RegExp(`(\\.\\.\/)`, 'g'));
                const depth = depthMatches ? depthMatches.length : 0;
                if (depth > depthAllowed) {
                    return { isInvalid: true, message: getMaxDepthMessage({ depth, depthAllowed }) };
                }
            }

            return { isInvalid: false, message: '' };
        }

        function checkPath(sourceNode) {
            if (sourceNode) {
                const { message, isInvalid } = pathValidity(sourceNode.value);
                if (isInvalid) {
                    context.report({
                        node: sourceNode,
                        message,
                    });
                }
            }
        }

        function checkNode(node) {
            switch (node && node.type) {
                case 'ExportNamedDeclaration':
                case 'ImportDeclaration':
                    checkPath(node.source);
                    break;

                case 'CallExpression':
                    if (node.callee && node.callee.name === 'require') {
                        checkPath(node.arguments[0]);
                    }
                    break;

                default:
                    break;
            }
        }

        return {
            ExportNamedDeclaration: checkNode,
            CallExpression: checkNode,
            ImportDeclaration: checkNode,
        };
    }
};
