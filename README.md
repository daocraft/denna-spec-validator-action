# Denna Spec Validator Action

A GitHub Action that validates `.denna-spec.json` files against their declared JSON Schemas.

## Usage

```yaml
- uses: daocraft/denna-spec-validator-action@v1
```

### Full example

```yaml
name: Validate Denna Specs

on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: daocraft/denna-spec-validator-action@v1
        with:
          patterns: |
            **/*.denna-spec.json
          exclude: |
            **/_template/**
          strict: false
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `patterns` | Glob pattern(s) to find `.denna-spec.json` files. Separate multiple patterns with newlines. | No | `**/*.denna-spec.json` |
| `exclude` | Glob pattern(s) to exclude. Separate multiple patterns with newlines. | No | `**/_template/**` |
| `strict` | Fail on any validation warning (not just errors). | No | `false` |

## Outputs

| Output | Description |
|--------|-------------|
| `validated` | Number of files that passed validation. |
| `failed` | Number of files that failed validation. |

### Using outputs

```yaml
- uses: daocraft/denna-spec-validator-action@v1
  id: validate

- run: echo "${{ steps.validate.outputs.validated }} passed, ${{ steps.validate.outputs.failed }} failed"
```

## How it works

Each `.denna-spec.json` file must have a `$schema` field pointing to its JSON Schema. The action:

1. Finds all matching `.denna-spec.json` files using the configured glob patterns.
2. Reads the `$schema` field from each file.
3. Resolves the schema — either from a local relative path or a remote URL (including `https://spec.denna.io/` schemas).
4. Validates the file using [Ajv](https://ajv.js.org/) with full format support.
5. Reports `PASS` or `FAIL` for each file, then exits with a non-zero code if any files failed.

## License

MIT
