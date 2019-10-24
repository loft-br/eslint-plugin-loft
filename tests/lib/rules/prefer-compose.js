/**
 * @fileoverview Enforces the use of connect rather than fall into HOC composition hell
 * @author Ramon
 */
'use strict';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const rule = require('../../../lib/rules/prefer-compose');
const RuleTester = require('eslint').RuleTester;

RuleTester.setDefaultConfig({
    parserOptions: {
        ecmaVersion: 6,
        ecmaFeatures: {
            jsx: true,
        },
        sourceType: 'module',
    }
});

const USE_COMPOSE_TWO_OR_MORE = 'Use compose for 2 or more HOC';

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

const ruleTester = new RuleTester();
ruleTester.run('prefer-compose', rule, {

    valid: [
        {
            code: `
                const Comparison = (props) => <div>aaa</div>;
                export default withStyles(styles)(Comparison);
            `,
        },
        {
            code: 'export default compose(withStyles(styles), withIntl)(Comparison)',
        },
        {
            code: `
                export default compose(
                    connect(mapStateToProps, {setUserFeatureFlags}),
                    withStyles(styles),
                    withIntl
                )(Comparison)
            `,
        },
        {
            code: `
                const smokeTry1 = withStyles(styles)(Comparison);
                const smokeTry2 = withIntl(smokeTry1);
                export default connect(mapStateToProps, {setUserFeatureFlags})(smokeTry2);
            `,
        },
        {
            code: 'const trimStr = `\$\{str\}`.trim();'
        }
    ],

    invalid: [
        {
            code: 'export default injectIntl(withStyles(styles)(Step13Value));',
            errors: [{
                message: USE_COMPOSE_TWO_OR_MORE,
                type: 'CallExpression',
            }],
        },
        {
            code: 'export default withStyles(styles)(injectIntl(About));',
            errors: [
                {
                    message: USE_COMPOSE_TWO_OR_MORE,
                    type: 'CallExpression',
                }
            ],
        },
        {
            code: `export default connect(
                     mapStateToProps,
                     { setUserFeatureFlags }
                   )(withIntl(withStyles(styles)(withRouter(DreamApartmentsLP))));`,
            errors: [
                {
                    message: USE_COMPOSE_TWO_OR_MORE,
                    type: 'CallExpression',
                },
                {
                    message: USE_COMPOSE_TWO_OR_MORE,
                    type: 'CallExpression',
                },
                {
                    message: USE_COMPOSE_TWO_OR_MORE,
                    type: 'CallExpression',
                },
            ],
        },
        {
            code: 'export default withRouter(compose(withStyles(styles), withIntl)(Comparison))',
            errors: [
                {
                    message: USE_COMPOSE_TWO_OR_MORE,
                    type: 'CallExpression',
                },
            ],
        },
    ]
});
