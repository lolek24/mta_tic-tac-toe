/**
 * @fileoverview Do not load modules/controls synchronously
 * @author Marc Schleeweiß
 */
"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

var rule = require("../../../lib/rules/no-global-name"),

    RuleTester = require("eslint").RuleTester;


//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

var ruleTester = new RuleTester();
ruleTester.run("no-global-name", rule, {

    valid: [
        {
            code: "sap.ui.define(['sap/m/Input'], function(Input) { \
                var fnCreateContent = function() { \
                    return new Input(); \
                }; \
            });"
        }, {
            code: "var oDialog = sap.ui.xmlfragment('com.namespace.my.fragment.Dialog');"
        }
    ],

    invalid: [
        {
            code: "sap.ui.define([], function() { \
                var fnCreateContent = function() { \
                    return new sap.m.Input(); \
                }; \
            });",
            errors: [{
                message: "Unexpected reference to global name",
                type: "MemberExpression"
            }]
        }, {
            code: "var oDialog = sap.ui.xmlfragment('com.namespace.my.fragment.Dialog');",
            options: [
                {
                    targetVersion: "1.60.12"
                }
            ],
            errors: [{
                message: "Unexpected reference to global name",
                type: "MemberExpression"
            }]
        }
    ]
});
