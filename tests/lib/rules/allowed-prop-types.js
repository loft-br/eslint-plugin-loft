/**
 * @fileoverview Allows prop types to be used
 * @author Luigi Perotti
 */
'use strict';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const rule = require('../../../lib/rules/allowed-prop-types');
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

const code = `
    import PropTypes from 'prop-types';
    
    const AComponent = ({ intl, classes, num }) => (
        <Something intl={intl} classes={classes} num={num} />
    );
    
    AComponent.propTypes = {
        intl: PropTypes.any,
        classes: PropTypes.any,
    };
    
    export { AComponent };
`;

const ruleTester = new RuleTester();
ruleTester.run('allowed-prop-types', rule, {

    valid: [
        {
            options: [{ allowed: ['intl', 'classes'] }],
            code,
        },
    ],

    invalid: [
        {
            options: [{ allowed: ['intl'] }],
            code,
            errors: [
                {
                    message: `Prop type \`any\` for key 'classes' is forbidden`,
                    type: 'Property',
                },
            ],
        },
    ]
});
