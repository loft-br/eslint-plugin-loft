/**
 * @fileoverview Enforces the use of compose rather than fall into HOC composition hell
 * @author Ramon, Luigi Perotti
 */
'use strict';

const MINIMUM_HOC_NUMBER = 2;
const DEFAULT_HOCS = [
    // 'withIntl',
    // 'withTheme',
    // 'withRouter',
    // 'withStyles',
    // 'connect',
    // 'injectIntl'
];

module.exports = {
    meta: {
        docs: {
            description: 'Enforces absolute import from downwards folders',
            category: 'Best Practices',
            recommended: true,
        },

        schema: [{
            type: 'object',
            properties: {
                minHocs: {
                    type: 'number'
                },
                hocs: {
                    type: 'array',
                    items: {
                        type: 'string',
                    },
                },
            },
            additionalProperties: true,
        }],
    },

    create(context) {
        const configuration = context.options[0] || {};
        const minHocs = typeof configuration.minHocs === 'number' ? configuration.minHocs : MINIMUM_HOC_NUMBER;
        if (minHocs < 2) {
            throw new Error('"minHocs" must be at least 2');
        }
        const hocs = [...configuration.hocs || [], ...DEFAULT_HOCS];

        function isHoc(name) {
            return hocs.indexOf(name) > 0;
        }

        function calleeIsCompose(callee) {
            if (!callee) {
                return false;
            }

            if (callee.type === 'Identifier') {
                return callee.name === 'compose';
            }

            if (callee.type === 'CallExpression') {
                return calleeIsCompose(callee.callee);
            }

            return false;
        }

        function calleeIsHoC(callee) {
            if (!callee) {
                return false;
            }

            if (callee.type === 'Identifier') {
                return isHoc(callee.name);
            }

            if (callee.type === 'CallExpression') {
                return calleeIsCompose(callee.callee);
            }

            return false;
        }

        function checkNumberOfHocs(node, foundHoCAbove) {
            switch (node && node.type) {
                case 'CallExpression':
                    if (!foundHoCAbove && calleeIsCompose(node.callee)) {
                        return checkNumberOfHocs(node.callee, foundHoCAbove);
                    }

                    const foundHoC = foundHoCAbove || calleeIsHoC(node.callee);
                    const hocsInArgs = (node.arguments || []).reduce((sum, arg) => {
                        return sum + checkNumberOfHocs(arg, foundHoC);
                    }, 0);
                    return hocsInArgs + checkNumberOfHocs(node.callee, foundHoC);

                case 'Identifier':
                    return Number(isHoc(node.name));

                default:
                    return 0;
            }
        }

        function checkNode(node) {
            switch (node && node.type) {
                case 'CallExpression':
                case 'Identifier':
                    const found = checkNumberOfHocs(node, false);
                    if (found >= minHocs) {
                        context.report({
                            node: node,
                            message: `Prefer compose over nesting calls for HoCs. Found ${found}`,
                        });
                    }
                    break;

                default:
                    break;
            }
        }

        return {
            CallExpression: checkNode,
        };
    }
};
