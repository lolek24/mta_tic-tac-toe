# Do not access controls using their global ID (no-global-id)

This rule shall prevent bugs and improve the architecture within a SAPUI5/OpenUI5 application.


## Rule Details

This rule aims to prevent accessing controls using their global ID. 

A control declared with an ID (e.g. `<Button id="myButton" />`) will automatically be assigned a unique global ID by the UI5 framework. This unique ID contains of the ID of the surrounding view and the declared ID of the control (e.g. `"__xmlview1--myButton"`).

In the controller a control can be accessed both using their declared ID and their generated global ID. Since the global ID is auto-generated it can and will change. For example in a Fiori Launchpad the ID could be `"___xmlview4--myButton"`, thus breaking the code.

To access a control in its view, a controller provides the method `byId` which uses the declared ID. Accessing a control from a different view is usually a sign of a poor structure.

Examples of **incorrect** code for this rule:

```js

const oButton = sap.ui.getCore().byId("__xmlview1--userList")

```

Examples of **correct** code for this rule:

```js

const oButton = this.byId("userList");

```
