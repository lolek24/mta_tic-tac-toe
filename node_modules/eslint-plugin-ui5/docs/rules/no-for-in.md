# No usage of for...in loops (no-for-in)

This rule shall prevent the usage of `for..in` loops, especially in combination with `const`.


## Rule Details

A correctly written (i.e. guarded) `for...in` loop reduces readability. If the enumerable property is declared with `const` an error is thrown in IE11 (*`const` must be initialized*).

Thus it is easier to use `Object.keys().forEach()` instead.

Examples of **incorrect** code for this rule:

```js
for (const key in foo) {
    if (Object.prototype.hasOwnProperty.call(foo, key)) {
        doSomething(key);
    }
}
```

Examples of **correct** code for this rule:

```js
Object.keys(foo).forEach(function(key) {
    doSomething(key);
});
```


## When Not To Use It

If you do not target IE11 (or lower) and don't want to use functional programming do not use this rule.
