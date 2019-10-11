/**
 * @fileoverview Enforces the use of compose rather than fall into HOC composition hell
 * @author Ramon
 */
"use strict";

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

module.exports = {
    meta: {
        docs: {
            description: "Enforces the use of compose rather than HOC composition",
            category: "Stylistic Issues",
            recommended: true
        },
        schema: []
    },

    create: function(context) {

        // variables should be defined here

        //----------------------------------------------------------------------
        // Helpers
        //----------------------------------------------------------------------

        // any helper functions should go here or else delete this section

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------

        return {
            CallExpression: function(node) {
                const args = node.arguments;
                const nodeIsIdentifier = node.callee.type === 'Identifier';
                const isCompose = nodeIsIdentifier && node.callee.name === 'compose';
                const isArgCallExpression = args[0].type === 'CallExpression';
                const containsMultipleHOC = isArgCallExpression && !isCompose;

                if(containsMultipleHOC) {
                    context.report({
                        message: 'Use compose for 2 or more HOC',
                        node: node,
                    });
                }
            },
        };
    }
};
