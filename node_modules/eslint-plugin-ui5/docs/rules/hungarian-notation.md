# Use hungarian notation when declaring variables (hungarian-notation)

We strongly recommend to use the Hungarian notation where name prefixes indicate the type for variables and object field names.

## Rule Details

This rule aims to enforce Hungarian notation. Since JavaScript is dynamically typed this rule makes it easier to see the expected type of a variable.

The following prefixes are recommended:

| Sample | Type |
|-|-|
| `sId` | string |
| `oDomRef` | object |
| `$DomRef` | jQuery object |
| `iCount` | int |
| `mParameters` | map / assoc. array |
| `aEntries` | array |
| `dToday` | date |
| `fDecimal` | float |
| `bEnabled` | boolean |
| `rPattern` | RegExp |
| `fnFunction` | function |
| `vVariant` | variant types |

Exceptions to the rule are the following variable names:
`that, resolve, reject, cb, done`.

Examples of **incorrect** code for this rule:

```js
var users = ["Adam", "Eve"];

var fnLog = function(text) {
    console.log(text);
};
```
Examples of **correct** code for this rule:

```js
var aUsers = ["Adam", "Eve"];

return new Promise(function(resolve, reject) {
    resolve("Test");
});
```

## Options

### onlyDeclarations
A boolean to specify if only var, function, and class declarations are required to match the specified regular expression.

Examples of **correct** code for this rule with the `{ "onlyDeclarations": true }` option:

```js
var fnLog = function(text) {
    console.log(text);
};
```

### ignore

An array of names to ignore. It's set to `[]` by default.If provided, it must be an `Array`.

Examples of **incorrect** code for this rule:

```js
QUnit.test("I should test my formatters", function(assert) {
    assert.ok(true);
});
```

Examples of **correct** code for this rule with the `{ "ignore": ['assert', 'my_var'] }` option:

```js
QUnit.test("I should test my formatters", function(assert) {
    var my_var = true;
    assert.ok(my_var);
});
```


## When Not To Use It

If you don't want to enforce Hungarian notation do not use this rule.
