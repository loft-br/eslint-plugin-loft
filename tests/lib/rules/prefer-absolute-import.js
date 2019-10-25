/**
 * @fileoverview Enforces the use of aboslute imports to avoid dot-hell
 * @author Luigi Perotti
 */
'use strict';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const rule = require('../../../lib/rules/prefer-absolute-import');
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

const ruleTester = new RuleTester();
ruleTester.run('prefer-absolute-import', rule, {

    valid: [
        {
            code: `import something from 'somewhere';`,
        },
        {
            code: `import something from 'somewhere/yay/paths';`,
        },
        {
            code: `import something from './somewhere';`,
        },
        {
            code: `import something from './somewhere/yay/paths';`,
        },
    ],

    invalid: [
        {
            code: `import Something from '../../somewhere';`,
            errors: [{
                message: 'Prefer absolute imports for nesting over depth 0. Found depth 2',
                type: 'Literal',
            }],
        },
        {
            code: `import something from 'somewhere/../wrong';`,
            errors: [{
                message: 'Invalid path access. Don\'t use relative imports within path string',
                type: 'Literal',
            }],
        },
        {
            code: `import Something from './somewhere/../wrong';`,
            errors: [{
                message: 'Invalid path access. Don\'t use relative imports within path string',
                type: 'Literal',
            }],
        },
        {
            code: `import Something from './../somewhere/../../really/wrong';`,
            errors: [{
                message: 'Invalid path access. Don\'t use relative imports within path string',
                type: 'Literal',
            }],
        },
    ]
});
