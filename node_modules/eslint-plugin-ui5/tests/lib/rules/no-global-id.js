/**
 * @fileoverview Checks if controls are accessed using their global ID
 * @author Marc Schleeweiß
 */
"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

var rule = require("../../../lib/rules/no-global-id"),

    RuleTester = require("eslint").RuleTester;


//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

var ruleTester = new RuleTester();
ruleTester.run("no-global-id", rule, {

    valid: [
        {
            code: 'var oView = this.getView();'
        }
    ],

    invalid: [
        {
            code: 'var oView = sap.ui.getCore().byId("__xmlview1");',
            errors: [{
                message: "Unexpected access of control using a global ID",
                type: "CallExpression"
            }]
        }
    ]
});
