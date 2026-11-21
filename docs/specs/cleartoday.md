# Clear today

A command to empty the today note of the tasks left over at the end of a day, so the next day's planning starts from a clean note. The tasks go to the end of the overview note, under a heading saying they came out of today and when. Agreed on 2026-11-18; the code is in `src/tasks/`.

## The command

- **Move open tasks to overview** (`plugin-van-ronald:move-open-tasks-to-overview`, icon `sunset`).
- Offered only while the today note (setting **Note for today**) is the active note and the overview note (**Note for overview**) is set, exists and is a different note. Otherwise it is hidden from the command palette, like **Move line(s) to …**. It reads the settings each time the palette asks, so a change needs no reload.
- No ribbon icon and no URI.

## What moves

The unit is a **task hierarchy**: a top-level task with all of its nested subtasks and nested plain bullets (see the definitions in `AGENTS.md`), the same unit **Move tagged tasks to their GTD notes** moves.

- Every task hierarchy in today moves, **except a finished one**: the top-level task is `[x]` or `[X]` and so is every checkbox below it. Those stay for **Move finished tasks to "klaar"**, which uses the same definition.
- So an open task moves with its finished subtasks, and a `[-]` or `[o]` task counts as not finished and moves.
- Everything that isn't a task hierarchy stays: headings, paragraphs, frontmatter, top-level plain bullets with whatever hangs under them (a `- Werk` bullet with tasks under it stays as a whole), and lists inside a callout or blockquote (indented roots, which `hierarchies` in `reorder.ts` already leaves out).
- A blank line inside a hierarchy (between a task and its subtask) moves with it. Blank lines between hierarchies stay behind, and where a moved run sat between two blank lines, one of them goes, so no double gap is left. A `---` rule left at the top of the body, as **Move tasks with a tag to top** puts there, goes too. This is what `takeByDestination` in `reorder.ts` already does.

## What changes on the moved lines

- The today tag (setting **Tag for today**, `vandaag` by default) is taken off every moved line, root and descendants, with `removeTag` from `taglines.ts`. Otherwise **Move tagged tasks to their GTD notes** would send the tasks straight back to today. Nothing is removed when the setting is empty.
- Nothing else changes: no re-indenting (top-level tasks are at column 0 already) and no other tags touched.

## Where they land

At the end of the overview note, under a level-2 heading that links the daily note of the day the command runs, in the format of the core **Daily notes** plugin (`YYYYMMDD` when that isn't set), like the heading "klaar" uses:

```markdown
…what overview already holds…

## Uit vandaag [[20261118]]

- [ ] Bel Jan #prio
	- [ ] nummer opzoeken
	- notitie bij Jan
- [ ] Offerte tuin \30
```

- The heading is added only when the last `##` heading of overview isn't this one (trailing whitespace ignored). A second run on the same day, with nothing else headed after it, adds the tasks under the same heading.
- The heading gets a blank line before it (unless the note is empty or already ends with one) and one after it.
- The hierarchies keep their order from today, one after the other with no blank lines between them, and the text ends with a newline.
- The date is the day the command runs, not the day the tasks were planned: running it the next morning puts the next day's date in the heading. "Uit vandaag [[date]]" reads as "taken out of today on that date".

## Order of writing, undo, notices

The same as the other moves (`movetonotes.ts`, `klaar.ts`):

1. Take the editor's text and a fresh cache of it (`freshCache`). If that fails or the text changed meanwhile: notice "Note changed while moving; try again".
2. Nothing to move: notice "No open tasks to move". Overview isn't touched.
3. Append to overview first with `Move.append` from `undomove.ts`, heading and all. When overview is open in an editor, the text goes in through that editor, as a step of its own history; otherwise through `app.vault.process`.
4. If the editor's text changed while writing: notice "Note changed while moving; copied to overview but left here too", where "overview" is the note's basename, and stop.
5. Take the hierarchies out of today in one editor change with `Move.finish` from `undomove.ts`. Restore the cursor (`restoreCursor`).
6. Notice "Moved 3 tasks to overview": the number of hierarchies and the note's basename; "1 task" for one.

### Undo

The move is one undo step in both notes. Undo in today puts the tasks back in today and takes them, with a heading added for them, out of overview; undo in overview does the same the other way round. Redo, in either, moves them again.

- Overview must not be written with `app.vault.process` while it is open: Obsidian would load the lines into its editor as an edit of its own, and undo there would take them out of overview without putting them back in today. That was the bug in the first version.
- The other note is undone with its own undo when the move is its last history step, so both histories stay in line. Otherwise its text is changed outside the history: today goes back to what it was if it is still as the move left it, and otherwise the tasks go to the end of today; they are never dropped.
- Limit: with one note open in two tabs, Obsidian copies each edit into the other tab as a plain undo step there, which knows nothing of the move. Undo in that other tab only undoes that note's half.

### Open issue: Move lines to note

Found on 2026-11-18, not fixed yet. **Move lines to note** in `editing/` (`moveLinesToNote` in `editing/linecommands.ts`) has the bug fixed above, without any undo across notes at all. It appends with `appendToNote` (`app.vault.process`) and then takes the lines out of the source with `removeLines`. So:

- With the chosen note open, undo there takes the lines out of that note, and they don't come back in the source: they are lost.
- Undo in the source puts the lines back there but leaves them in the chosen note too: they end up in both.

The fix is to have it use `Move` from `tasks/undomove.ts`: `move.append(file, (content) => textToAppend(content, text))`, then `move.finish(editor, next, text)` in place of `removeLines`. `editing/` may not import from `tasks/`, so `undomove.ts` moves to `shared/editor/` first. It has no feature knowledge, and a second feature needing it is the reason to move it. `undoableMoves()` is then registered once, from `main.ts` or from whichever feature registers first, but not twice. Check it in the TestVault the same way as the cases above: the chosen note open and closed, undo and redo in either note.

## Code

- `reorder.ts`: `takeByDestination`'s callback gets a second argument, `finished`: whether the hierarchy is finished in the sense above. Existing callers ignore it.
- `dayheading.ts` (new, tested): the daily-note date format (moved from `klaar.ts`), the `[[date]]` link for today, and `appendUnderHeading(app, file, heading, text)`, which appends `text` to `file` under `heading`, adding the heading when the note doesn't end under it already, and returns exactly what it added. Its pure part, the text to add given the note's content, is what the test covers. `klaar.ts` uses it too, in place of its own `ensureTodayHeading`; klaar's heading (`## [[date]]`) and behaviour stay the same, except that tasks no longer get glued onto a last line that has no newline.
- `leftovers.ts` (new, tested): `takeLeftovers(text, cache, todayTag)`, which returns today's text without the hierarchies, the text to append (today tag removed) and the number moved. Pure: types from `obsidian` only.
- `cleartoday.ts` (new): the command's work, steps 1–6 above.
- `index.ts`: registers the command with an `editorCheckCallback`, and lists it under "Moving tasks" in the overview at the top, and the new files under "Where the code is". Undo works because `undoableMoves` is already registered.

## Tests

`npm test`, next to the modules:

- `leftovers.test.ts`: a today note with frontmatter, a heading, an open hierarchy with a finished subtask and a plain bullet under it, a finished hierarchy, a `[-]` task, a top-level plain bullet with a task under it, a task in a callout, and blank lines between them. Check what stays, what moves, in which order, that `#vandaag` is gone from root and subtask lines (`#vandaag/x` and other tags stay), the count, and that a note with only finished tasks moves nothing.
- `dayheading.test.ts`: appending to an empty note, a note without a trailing newline, a note ending with the same heading, and a note whose last `##` heading is another one.
- `reorder.test.ts` still passes: the extra callback argument changes nothing for the existing callers.

## Checking it in the TestVault

`VAULT_OBSIDIAN="$VAULT_TEST" ./to-vault.sh`, then with `obsidian vault=TestVault`: open the today note with `app.workspace.getLeaf(false).openFile(…)`, run `plugin-van-ronald:move-open-tasks-to-overview`, read today and overview from disk, undo with `app.workspace.activeEditor.editor.undo()` and check that both notes are back as they were, and look at `dev:errors`. Check that the command is missing from the palette in another note. Lint stays at its count from before the change.
