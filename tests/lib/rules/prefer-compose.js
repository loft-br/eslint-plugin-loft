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

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

const options = [{
    hocs: [
        'withIntl',
        'withTheme',
        'withRouter',
        'withStyles',
        'connect',
        'injectIntl'
    ],
}];

const ruleTester = new RuleTester();
ruleTester.run('prefer-compose', rule, {
    valid: [
        {
            options,
            code: `
                const Comparison = (props) => <div>aaa</div>;
                export default withStyles(styles)(Comparison);
            `,
        },
        {
            options,
            code: 'export default compose(withStyles(styles), withIntl)(Comparison)',
        },
        {
            options,
            code: `
                export default compose(
                    connect(mapStateToProps, {setUserFeatureFlags}),
                    withStyles(styles),
                    withIntl
                )(Comparison)
            `,
        },
        {
            options,
            code: `
                const smokeTry1 = withStyles(styles)(Comparison);
                const smokeTry2 = withIntl(smokeTry1);
                export default connect(mapStateToProps, {setUserFeatureFlags})(smokeTry2);
            `,
        },
    ],

    invalid: [
        {
            options,
            code: 'export default injectIntl(withStyles(styles)(Step13Value));',
            errors: [{
                message: 'Prefer compose over nesting calls for HoCs. Found 2',
                type: 'CallExpression',
            }],
        },
        {
            options,
            code: 'export default withStyles(styles)(injectIntl(About));',
            errors: [
                {
                    message: 'Prefer compose over nesting calls for HoCs. Found 2',
                    type: 'CallExpression',
                }
            ],
        },
        {
            options,
            code: `export default connect(
                     mapStateToProps,
                     { setUserFeatureFlags }
                   )(withIntl(withStyles(styles)(withRouter(DreamApartmentsLP))));`,
            errors: [
                {
                    message: 'Prefer compose over nesting calls for HoCs. Found 3',
                    type: 'CallExpression',
                },
                {
                    message: 'Prefer compose over nesting calls for HoCs. Found 2',
                    type: 'CallExpression',
                },
                {
                    message: 'Prefer compose over nesting calls for HoCs. Found 2',
                    type: 'CallExpression',
                },
            ],
        },
        {
            options,
            code: 'export default withRouter(compose(withStyles(styles), withIntl)(Comparison))',
            errors: [
                {
                    message: 'Prefer compose over nesting calls for HoCs. Found 2',
                    type: 'CallExpression',
                },
            ],
        },
    ]
});
