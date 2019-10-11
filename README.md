# eslint-plugin-loft

Loft&#39;s ESLint custom rules

## Installation

You'll first need to install [ESLint](http://eslint.org):

```
$ npm i eslint --save-dev
```

Next, install `eslint-loft-rules`:

```
$ npm install eslint-loft-rules --save-dev
```

**Note:** If you installed ESLint globally (using the `-g` flag) then you must also install `eslint-loft-rules` globally.

## Usage

Add `eslint-loft-rules` to the plugins section of your `.eslintrc` configuration file:

```json
{
    "plugins": [
        "eslint-loft-rules"
    ]
}
```


Then configure the rules you want to use under the rules section.

```json
{
    "rules": {
        "loft/prefer-compose": 2
    }
}
```

## Supported Rules

* prefer-compose: Rule that suggests the use of compose, instead of multiple HOC
