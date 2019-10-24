/**
 * @fileoverview Loft&#39;s ESLint custom rules
 * @author Ramon
 */
"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

var requireIndex = require("requireindex");

//------------------------------------------------------------------------------
// Plugin Definition
//------------------------------------------------------------------------------

const rules = requireIndex(__dirname + "/rules");

// import all rules in lib/rules
module.exports = {
  rules,
};
