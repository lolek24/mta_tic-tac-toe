# No comparison against boolean literals (no-boolean-literal-compare)

This rule shall prevent comparison against boolean literals


## Rule Details

Comparing against boolean literals is (in most cases) redundant and reduces readability. If it increases readability it is a sign of poor naming.

In the rare case where truthiness or falsiness is not enough and you actually need to compare against a boolean value simply introduce a helper variable (see examples below)

Examples of **incorrect** code for this rule:

```js
if (control.getVisibilityFlag() === true) {
    doSomething();
}
```

Examples of **correct** code for this rule:

```js
// Introduction of helper variable
const isVisible = control.getVisibilityFlag();
if (isVisible) {
    doSomething();
}
```

```js
// renaming of accessor method
if (control.isVisible()) {
    doSomething();
}
```
```js
// Introduction of variable to do strict comparison
const expectedInput = true
const userInput = 5;
if (userInput === expectedInput) {
    doSomeStuff();
}
```

## When Not To Use It

If your code heavily relies on strict comparison (using `!==` and `===`) and truthiness/falsiness is not enough do not use this rule.
