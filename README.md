# eslint-plugin-loft

Loft&#39;s ESLint custom rules

## Installation

You'll first need to install [ESLint](http://eslint.org):

```
$ npm i eslint --save-dev
```

Next, install `eslint-plugin-loft`:

```
$ npm install eslint-plugin-loft --save-dev
```

**Note:** If you installed ESLint globally (using the `-g` flag) then you must also install `eslint-plugin-loft` globally.

## Usage

Add `loft` to the plugins section of your `.eslintrc` configuration file. You can omit the `eslint-plugin-` prefix:

```json
{
    "plugins": [
        "loft"
    ]
}
```


Then configure the rules you want to use under the rules section.

```json
{
    "rules": {
        "loft/rule-name": 2
    }
}
```

## Supported Rules

* Fill in provided rules here





