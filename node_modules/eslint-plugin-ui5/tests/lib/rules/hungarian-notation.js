/**
 * @fileoverview Use hungarian notation when declaring variables
 * @author Marc Schleeweiß
 */
"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

var rule       = require("../../../lib/rules/hungarian-notation"),

    RuleTester = require("eslint").RuleTester;


//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

var ruleTester = new RuleTester();
ruleTester.run("hungarian-notation", rule, {

    valid: [
        {
            code: "var aUsers = [\"Adam\", \"Eve\"];"
        }, {
            code: "var fnLog = function(text) { console.log(text); }",
            options: [
                {
                    onlyDeclarations: true
                }
            ]
        }, {
            code: "for (var i = 0; i < 5; i++) { console.log(i); }"
        }, {
            code: "var $Button = jQuery('#myButton');"
        }, {
            code: "var VIEW_NAME = 'view';"
        }, {
            code: "var MyClass = { prop: 'Value', id: '6t8u4e' };"
        }, {
            code: "QUnit.test(\"I should test my formatters\", function(assert) { var my_var = false; assert.ok(my_var); });",
            options: [
                {
                    ignore: ["assert", "my_var"]
                }
            ]
        }
    ],

    invalid: [
        {
            code: "var users = [\"Adam\", \"Eve\"];",
            errors: [{
                message: "Use hungarian notation when naming variables",
                type: "Identifier"
            }]
        }, {
            code: "var fnLog = function(text) { console.log(text); }",
            errors: [{
                message: "Use hungarian notation when naming variables",
                type: "Identifier"
            }]
        },
        {
            code: "QUnit.test(\"I should test my formatters\", function(assert) {});",
            errors: [{
                message: "Use hungarian notation when naming variables",
                type: "Identifier"
            }]
        },
        {
            code: "QUnit.test(\"I should test my formatters\", function(asserts) {});",
            options: [
                {
                    ignore: ["assert"]
                }
            ],
            errors: [{
                message: "Use hungarian notation when naming variables",
                type: "Identifier"
            }]
        }
    ]
});
