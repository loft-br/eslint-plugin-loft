/**
 * @fileoverview Enforces the use of connect rather than fall into HOC composition hell
 * @author Luigi Perotti
 */
'use strict';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const rule = require('../../../lib/rules/index-reexport-named');
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

const DEFAULT_MESSAGE = 'Default exports are forbidden from index files';

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

const mapFilename = (v) => {
    v.filename = 'index.js';
    return v;
};

const ruleTester = new RuleTester();
ruleTester.run('index-reexport-named', rule, {

    valid: [
        {
            code: `export { something, anotherthing } from 'somewhere';`,
        },
        {
            code: `
                import { something, anotherthing } from 'somewhere';
                export { something, anotherthing };
            `,
        },
        {
            code: `export { default as Something, anotherthing } from 'somewhere';`,
        },
        {
            code: `
                import { default as Something, anotherthing } from 'somewhere';
                export { Something, anotherthing }; 
            `,
        },
    ].map(mapFilename),

    invalid: [
        {
            code: `export default Something;`,
            errors: [{
                message: DEFAULT_MESSAGE,
                type: 'ExportDefaultDeclaration',
            }],
        },
        {
            code: `export { default } from 'Something';`,
            errors: [{
                message: DEFAULT_MESSAGE,
                type: 'ExportNamedDeclaration',
            }],
        },
    ].map(mapFilename),
});
