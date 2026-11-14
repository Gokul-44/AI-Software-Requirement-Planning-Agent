# @spm/exporters

Turns a validated plan (`plan.json`) into files people can use. Pure functions with no I/O, so the API and the browser
share them.

## Main functions

| Function                     | Output                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| `toJiraCsv(plan)`            | a Jira CSV with epics, stories and tasks, sprint labels and `Blocked By` task codes |
| `toMarkdown(plan)`           | a readable Markdown report of the whole plan                                        |
| `toCsv`, `csvCell`, `csvRow` | an RFC 4180 CSV writer                                                              |
| `neutraliseFormula`          | protects spreadsheet programs from cells that start with `=`, `+`, `-` or `@`       |
| `escapeMarkdown`             | neutralises HTML and link syntax in model-written text                              |

Plan text comes from a language model, so it is treated as untrusted: formulas and markup are escaped on export. How
the columns map to Jira is described in [docs/design/jira-mapping.md](../../docs/design/jira-mapping.md).

## Test

```bash
npm test -w @spm/exporters
```

Snapshot tests pin the Markdown and CSV output, and a fixture test keeps
[`docs/samples/jira-sample.csv`](../../docs/samples/jira-sample.csv) in step with the exporter (regenerate it with
`npm run fixture`).
