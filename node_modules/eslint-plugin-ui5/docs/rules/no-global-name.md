# Do not load modules/controls synchronously (no-global-name)

This rule shall ensure that no references to global names are used.


## Rule Details

Only local variables should be used inside the AMD factory function. Do not access the content of other modules via their global names, not even for such fundamental stuff like jQuery or sap.ui.Device. You can't be sure that the modules are already loaded and the namespace is available.

There are some exceptions to this rule, this is to ensure basic functionality like `sap.ui.define`. Depending on the UI5 version there can be more exceptions. Functions like `sap.ui.xmlfragment` have been deprecated by SAP at a later time.

Examples of **incorrect** code for this rule:

```js
sap.ui.define(["sap/m/Button"], function(Button) {
    var fnCreateContent = function() {
        // global reference on sap.m.Input, which might not be loaded yet
        return new sap.m.Input({
            color: ...,
        });
    };
});
```
```js
sap.ui.define([], function() {
    var fnCreateContent = function() {
        // global reference on jQuery, which might not be loaded yet
        jQuery.sap.log.info("Hello");
    };
});
```

Examples of **correct** code for this rule:

```js
sap.ui.define(["sap/m/Input"], function(Input) {
 
    var fnCreateContent = function() {
        // reference sap.m.Input via a dependency
        return new Input({
            color: ...,
        });
    };
});
```
```js
sap.ui.define(["jquery.sap.global"], function(jQuery) {
    var fnCreateContent = function() {
        // global reference on jQuery, which might not be loaded yet
        jQuery.sap.log.info("Hello");
    };
});
```

## Options

### targetVersion

A string specifying against which UI5 version to test. As a rule of thumb, the higher the version, the stricter the checks.

Examples of **correct** code for this rule with the `{ "targetVersion": "1.60" }` option:

```js
sap.ui.require(["sap/ui/core/Fragment"], function(Fragment){
    Fragment.load({
        name: "com.namespace.my.fragment.Dialog"
    }).then(function(oDialog){
        oDialog.open();
    });
});
```

Examples of **incorrect** code for this rule with the `{ "targetVersion": "1.60" }` option:


```js
sap.ui.require([], function(){
    const oDialog = sap.ui.xmlfragment("com.namespace.my.fragment.Dialog");
    oDialog.open();
});
```


## Further Reading

This rule covers only moduls in the `sap` namespace.

To prevent developers from accessing jQuery via the global name another setting has to be made in the configuration file `.eslintrc`: Remove `jQuery`, `$` and other aliases from the `globals` section
