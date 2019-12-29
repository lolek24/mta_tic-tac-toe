/**
 * @fileoverview No comparison against boolean literals
 * @author Marc Schleeweiß
 */
"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

var rule = require("../../../lib/rules/no-boolean-literal-compare"),

    RuleTester = require("eslint").RuleTester;


//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

var ruleTester = new RuleTester();
ruleTester.run("no-boolean-literal-compare", rule, {

    valid: [
        {
            code: "if (isVisible) { doSomething(); }"
        }, {
            code: "var expectedResult = true; \
                   if (userChoice === expectedResult) { \
                     doSomething(); \
                   }"
        }
    ],

    invalid: [
        {
            code: "if (isVisible === true) { doSomething(); }",
            errors: [{
                message: "Unexpected boolean literal comparison",
                type: "BinaryExpression"
            }]
        }
    ]
});
