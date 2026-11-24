# Sync: bring the blueprint in line with the code

**Run:** daily or after merges, as a scheduled agent task. Also fine on demand ("follow `blueprint/workflows/sync.md`").
**Changes:** blueprint documents only. Never code.
**Ends with:** one pull request with the documentation updates, or a short "nothing to update" report.

## Goal

The documents in `blueprint/` describe what the product does and why. Over time the code moves on and the documents fall behind. Your job is to find recent changes in the code that the documents no longer describe correctly, and update the documents so a new team member, or another agent, can trust them again.

You are an editor, not an author. Record what the code now does; don't invent intent the team hasn't expressed.

## Steps

1. **Find the range.** Start from the last sync: `git log -1 --format=%H --grep="blueprint sync"`. If there is none, use the last 7 days (`git log --since="7 days ago"`). If the range holds only blueprint changes, stop and report "nothing to sync".
2. **Read what changed.** `git log --stat <range>`, then the diffs that matter. Skip lockfiles, generated files, formatting and tests that don't change behaviour. If a change came from a pull request, its description usually explains the intent: read it (`gh pr list --state merged --search <sha>`) when you can.
3. **Pick the affected documents.** Use the table *Which document covers what* in `blueprint/README.md` as a starting point, then judgement: a schema change usually touches 03, a new screen 02 and 01, a new integration 05, a hosting change 06. Read only those documents, plus the feature specs and ADRs they mention.
4. **Compare and edit.** For each document, check whether it still says what the code does. Where it doesn't, make the smallest edit that fixes it: a row in a table, a sentence, a status. Keep headings, IDs and the author's wording elsewhere. Set `last_reviewed` to today on every document you checked, changed or not.
   - Feature specs: when the code now implements all acceptance criteria of a feature, set its status to `implemented` and update its row in 07.
   - Roadmap (07): add a line to the delivery log for each shipped feature or notable change.
5. **Check your edits.** Every `FEAT-`, `ADR-` and `DEV-` ID you mention exists; links point to files that exist; terms match the glossary in 03.

## How to decide

- **The docs are outdated:** the code made a deliberate change (new table, renamed concept, new endpoint). Update the docs.
- **The code looks wrong:** it contradicts an approved requirement or looks like a bug. Don't document the bug. List it under *Possible drift* in the PR and leave the docs as they are.
- **The change alters intent:** it would change a requirement, acceptance criterion or rule in a document or feature with `status: approved`, or anything in `00-product-core.md`. Don't edit; list it under *Needs a decision* with the text you'd propose.
- **Unsure:** prefer a question in the PR over a guess in the docs.

## Finish

- If nothing needs to change, edit nothing and report which commits you checked and why no update was needed.
- Otherwise commit on a new branch `blueprint-sync/<yyyy-mm-dd>` with the message `docs(blueprint): blueprint sync <first-sha>..<last-sha>` and open a pull request. If you can't open pull requests from where you run, leave the branch committed and put the description in your final message.
- PR description, short: **Updated** (document · what changed · evidence commit or file), **Needs a decision**, **Possible drift**. Skip empty sections.
