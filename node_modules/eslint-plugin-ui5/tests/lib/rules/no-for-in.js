/**
 * @fileoverview No usage of for...in loops
 * @author Marc Schleeweiß
 */
"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

var rule = require("../../../lib/rules/no-for-in"),

    RuleTester = require("eslint").RuleTester;


//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

var ruleTester = new RuleTester();
ruleTester.run("no-for-in", rule, {

    valid: [
        {
            code: "for (var i = 0; i < list.length; ++i) { }"
        }, {
            code: "Object.key(dict).forEach(function(entry) { });"
        }
    ],

    invalid: [
        {
            code: "for (var key in dict) { }",
            errors: [{
                message: "Unexpected for...in loop",
                type: "ForInStatement"
            }]
        }
    ]
});
