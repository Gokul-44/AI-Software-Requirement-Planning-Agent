# Jira CSV mapping

> **UNVERIFIED.** This mapping has not been imported into Jira yet. Everything below describes what `toJiraCsv(plan)` writes and what we _expect_ Jira Cloud to do with it. Treat each "expected" as an assumption until the import test at the end of this page has been run and its results recorded. See MASTER_PLAN B1 Issue 7.

The exporter lives in `packages/exporters/src/jira.ts`. The sample file `docs/samples/jira-sample.csv` is generated from the food-delivery fixture by `npm run fixture` and is checked against the exporter by a test, so it cannot drift.

## Representation

| Plan entity | Jira issue type | Parent                |
| ----------- | --------------- | --------------------- |
| Epic        | Epic            | none                  |
| Story       | Story           | its Epic              |
| Task        | Sub-task        | its Story             |
| Requirement | label (`R-001`) | not an issue          |
| Sprint      | label (`sprint-1`) | not a Jira sprint |

Rows are written as all Epics, then all Stories, then all Sub-tasks, each in code order, so every parent comes before its children. `Issue Id` is a running number starting at 1. `Parent Id` holds the `Issue Id` of the parent and is empty for Epics.

## Columns

| CSV column    | Epic                                             | Story                                                                     | Sub-task                                                            | Jira field (expected)                                         |
| ------------- | ------------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------- |
| `Issue Id`    | running number                                   | running number                                                            | running number                                                      | Issue Id (import-only key used to resolve `Parent Id`)        |
| `Parent Id`   | empty                                            | Issue Id of the Epic                                                      | Issue Id of the Story                                               | Parent                                                        |
| `Issue Type`  | `Epic`                                           | `Story`                                                                   | `Sub-task`                                                          | Issue Type (must match the project's type names exactly)      |
| `Summary`     | `E-001 Title`                                    | `S-001 ` plus the "I want" clause, capitalised, without a leading "to"    | `T-001 Title`                                                       | Summary (255 characters at most)                              |
| `Description` | epic description                                 | `As a X, I want Y, so that Z.` then a blank line and `Acceptance criteria:` with one `- ` bullet per criterion | task description, blank line, `Layer: backend`, then `Blocked by: T-002, T-003` when there are predecessors | Description                                                   |
| `Priority`    | highest story priority in the epic               | `must` = High, `should` = Medium, `could` = Low                           | story priority, but always High for tasks on the critical path      | Priority (the names must exist in the site's priority scheme) |
| `Story Points`| empty                                            | sum of its tasks' points                                                  | the task's points (1, 2, 3, 5, 8 or 13)                             | "Story Points" (company-managed) or "Story point estimate" (team-managed) |
| `Labels` (repeated) | the R-codes of its stories                 | its R-codes, then `sprint-N` for each sprint its tasks fall in            | its R-codes, then `sprint-N`                                        | Labels; repeated columns should give several labels           |
| `Blocked By`  | empty                                            | empty                                                                     | codes of the tasks that must finish first, `T-002, T-003`           | Issue link ("is blocked by"), if the importer can map it      |

The number of `Labels` columns is the largest label count of any row (five for the food-delivery fixture). Empty cells are fine.

### Choices worth knowing

- **Story points appear twice.** A Story shows the sum of its Sub-tasks, and each Sub-task shows its own points. If Jira also sums Sub-task points into the Story on your boards, totals will double. If that happens, map `Story Points` for Sub-task rows only, or blank the Story column.
- **Sprints are labels.** Creating real Jira sprints from a CSV is not assumed to work. Filter by `sprint-2` instead, or drag issues into sprints by hand.
- **`Blocked By` is text.** It holds task codes (`T-002`), not Jira keys, because keys do not exist until the import has run. The same list is repeated in the Sub-task description as `Blocked by: ...`, so the dependency information survives even if no link is created. Turning the codes into real issue links needs a second step (for example a small script that reads the import result), which is out of scope until we know what the importer can do.
- **Line breaks inside cells** are real line feeds inside quoted fields. Rows end with CRLF (RFC 4180). The file is stored with `-text` in `.gitattributes` so git does not rewrite the line endings.

## Injection protection

Plan text is model-generated, so it is untrusted. Every text cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return is written with a leading apostrophe (`'=1+1`) so spreadsheet programs show it as text instead of running it (MASTER_PLAN N11). Fields containing commas, quotes or line breaks are quoted, and quotes are doubled. Jira will show the apostrophe as part of the text in those rare cases. Summaries start with our code (`T-001`), so they are never affected.

## Import test (to do in Week 1, owner: BE)

Goal: replace every "expected" above with an observed result, and record which columns mapped, which failed, and what the fallback is.

Menu names in Jira change from time to time. If a step does not match what you see, follow the importer's wizard and write down what it actually showed.

**Setup**

1. Create a free Jira Cloud site.
2. Create two Scrum projects: one **company-managed** and one **team-managed**. Name them clearly (for example `SPMC` and `SPMT`).
3. In each project check that the issue types **Epic**, **Story** and **Sub-task** exist, and that the story-points field is on the Story and Sub-task screens (company-managed: add "Story Points" to the screens; team-managed: "Story point estimate").
4. Check that the priority names **High**, **Medium** and **Low** exist.

**Import (repeat for both projects)**

5. Start the CSV importer (Settings > System > External system import > CSV, or the project's import option). Upload `docs/samples/jira-sample.csv`. Choose comma as the delimiter and UTF-8 as the encoding.
6. Pick the target project and map the columns:
   - `Issue Id` to Issue Id, and `Parent Id` to Parent (the importer may call it "Parent" or "Parent Id"; note the exact name).
   - `Issue Type` to Issue Type; map the values `Epic`, `Story`, `Sub-task` to the project's types.
   - `Summary`, `Description`, `Priority` to the fields of the same name; map the values `High`, `Medium`, `Low`.
   - `Story Points` to "Story Points" or "Story point estimate".
   - **Every** `Labels` column to Labels.
   - `Blocked By`: first try mapping it to an issue link type, then, if that is not offered or fails, leave it unmapped.
7. Run the import and save the import log.

**Check and record** (one row per item, for each project type; attach screenshots under `docs/samples/jira-import/`)

| Check                                                                                       | Expected                                  | Company-managed | Team-managed |
| ------------------------------------------------------------------------------------------- | ----------------------------------------- | --------------- | ------------ |
| Issue count equals the CSV data rows (fixture: 4 + 10 + 27 = 41)                           | 41 issues created                         |                 |              |
| Epic, Story and Sub-task types are kept                                                     | no type remapped                          |                 |              |
| Stories sit under their Epic                                                                | Epic shows its Stories                    |                 |              |
| Sub-tasks sit under their Story                                                             | Story shows its Sub-tasks                 |                 |              |
| Summaries keep the code prefix                                                              | `T-001 ...`                               |                 |              |
| Description keeps line breaks and the criteria bullets                                      | readable list                             |                 |              |
| Priority values are mapped                                                                  | High, Medium, Low                         |                 |              |
| Story points land in the right field, on Stories and Sub-tasks                              | numbers shown                             |                 |              |
| Repeated Labels columns give several labels                                                 | `R-001`, `sprint-1` on one issue          |                 |              |
| `Blocked By` creates links                                                                  | link, or unmapped (then text in the description) |           |              |
| An apostrophe-prefixed cell imports as text (edit one cell to start with `=`, re-export, import) | text, no formula                          |                 |              |

**After the test**

8. Update the "expected" statements on this page to "observed", remove the UNVERIFIED banner, and note the Jira version or date.
9. If a mapping failed, change `jira.ts` (and its snapshot test), run `npm run fixture`, and import again. Typical fallbacks: put sprint and requirement codes in the Description instead of Labels; drop the Story-level points; export dependencies as text only.
10. Repeat the import with real generated output in Week 10.
