/**
 * @fileoverview Enforces exporting of named variables from index files
 * @author Luigi Perotti
 */
'use strict';

const message = 'Default exports are forbidden from index files';

module.exports = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Restrict index files to exporting named objects only',
            category: 'Best Practices',
            recommended: true,
        },
        schema: []
    },

    create(context) {
        function checkSpecifiers(node) {
            node.specifiers.forEach(({ exported }) => {
                if (exported.name === 'default') {
                    context.report({ node, message });
                }
            });
        }

        function checkNode(node) {
            switch (node && node.type) {
                case 'ExportNamedDeclaration':
                    checkSpecifiers(node);
                    break;
                case 'ExportDefaultDeclaration':
                    context.report({ node, message });
                    break;
                default:
                    break;
            }
        }

        function shouldCheckNode() {
            return /index.[jt]s$/.test(context.getFilename());
        }

        return {
            ExportDefaultDeclaration(node) {
                if (shouldCheckNode()) {
                    checkNode(node);
                }
            },

            ExportNamedDeclaration(node) {
                if (shouldCheckNode()) {
                    checkNode(node);
                }
            },
        };
    }
};
