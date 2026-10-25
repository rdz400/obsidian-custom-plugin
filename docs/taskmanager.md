# Task manager — spec

A large modal that lists every task in the task notes, lets you select tasks
(several at once) and change them: toggle tags, move tasks to a GTD note,
finish or reopen them. Changes are **staged**: the list shows the result
straight away, and nothing is written until you select **Apply**, which writes
each changed note once. It sits beside "Search tasks", which stays as it is:
the search finds and opens a task; the manager is for sorting and tidying many
tasks at once. Mobile is a first-class target, not an afterthought.

Decisions made in the interview of 2026-10-25 are marked **(decided)**.
Everything else is a default chosen to fit them; change it here before building.

---

## 1. Scope

In:

- Every task in the task notes, grouped by note, shown as a tree.
- Filters: tag chips, GTD note chips, a "Done" chip and a "Top-level" chip.
- Selecting tasks with tap or click, Shift+click, the keyboard, and Mod+A.
- Staged changes to the selection: toggle tags, move to a GTD note, finish or
  reopen; then Apply, Discard, or step back with undo.
- An undo for the last apply.
- A tally of visible, selected and changed tasks, counts per note, estimates
  on rows.
- A "Manage tasks" command and a ribbon icon.

Out (for now):

- Text or fuzzy search **(decided)**.
- Opening a task's note from the manager **(decided: not needed)**.
- Editing a task's text, reordering tasks, collapsing groups.
- A URI action, chips for task notes other than the GTD notes, an "Untagged"
  chip, a total of the selected tasks' estimates **(decided: not now)**.
- Reverting a single task's changes (undo and Discard cover it for now).
- Refreshing the list live while notes change elsewhere (Apply checks for
  that, see §7.3).

---

## 2. Staged, not immediate (decided)

Why changes are collected and applied in one go, rather than written on every
tap:

- **Testability:** the core is one pure function: the notes' text, their list
  structure and the desired state go in, and the new text of each note comes
  out. A whole session (tag, move and finish the same task) can be tested in
  `node:test` without Obsidian.
- **Efficiency:** each note is written once per apply, and the vault is read
  again once, not after every action.
- **Speed:** a tap only changes memory, so it's instant even on a phone. There
  is no write, metadata parse and full re-read on every tap.
- **Maintainability:** tasks keep their identity in memory while you work, so
  the selection never has to be found again between actions. Undo before
  applying means restoring the earlier state in memory, with no file
  snapshots.

The costs, and how the design handles them:

- **Notes changing meanwhile** (sync, an open editor): Apply only touches a
  note whose text is exactly what the manager read. A note that changed has
  its changes skipped and reported (§7.3).
- **Losing work by closing:** closing with pending changes asks first (§3.4).
- **Showing what will happen:** rows show the end state and mark what changed
  (§3.1).

### 2.1 The desired state

Changes are stored as the **end state per task**, not as a list of operations:

```ts
interface Draft {
    ownTags: string[];       // the tags written on the task's own line
    done: boolean;
    moveTo?: GtdNote['id'];  // set only when the task itself is moved
}
```

- Every task starts with a draft equal to what its note says. A task is
  **changed** when its draft differs from that. "Add #prio, move, remove
  #prio" simply ends as "moved", and a change undone by hand drops out of the
  count by itself.
- Where a task ends up is derived: its own `moveTo`, or else where its nearest
  task above it ends up, or else the note it's in. So a parent's move takes
  its subtree along without storing anything on the subtasks.
- A subtask with its own `moveTo` that differs from where its parent ends up
  is cut out of the subtree and goes to its own target, outdented, as
  **Move line(s) to …** does with a subtask moved alone.
- **History:** every action pushes the drafts it changed (their earlier
  values) on a stack; Mod+Z pops one. Discard empties the stack and resets
  every draft.

---

## 3. Layout

```
┌──────────────────────────────────────────────┐
│ Manage tasks                              ✕  │  modal title
│ [#prio 3][#vandaag 5][#week 2][#buiten …]    │  tag filter chips   Mod+1…9
│ [today 4][someday 9][overview][inbox 2]      │  GTD note chips     Alt+1…4
│                           [Done][Top-level]  │  view chips         D, L
├──────────────────────────────────────────────┤
│ TODAY · 4                                    │  group heading + count
│ ◯ Bel Jan over de tuin            #prio      │
│ ● Schuur opruimen                 #buiten    │  ● = selected
│   ◯ Vegen                              20m   │  indented subtask, estimate
│ ▍● Lees [[Boek]]  from inbox      +#prio     │  ▍ = changed: moved, tag added
│ INBOX · 1                                    │
│ · Project tuin                               │  dimmed context row (parent)
│   ◯ Hek schilderen                #week      │
│ …                                      scroll│
├──────────────────────────────────────────────┤
│ 2 of 42 selected · 3 changed   ↶  Discard  [Apply 3] │
│ [#prio ◐][#vandaag ●][#week ◯][#buiten ◯]    │  tri-state tag buttons   1…9
│ → [Today][Someday][Overview][Inbox] [✓ Finish] │  T S O I, X
└──────────────────────────────────────────────┘
```

Three parts in a flex column: a header (title and filters, fixed), the list
(takes the rest, scrolls), and the action bar (pinned to the bottom, always
there **(decided)**).

### 3.1 The list

**Grouped by note, as a tree (decided). It always shows the end state.**

- One group per task note with visible tasks. Order: the GTD notes in
  `GTD_NOTES` order (today, someday, overview, inbox), then the other task
  notes by name (`localeCompare`). A group with no visible tasks is left out.
- Group heading: the GTD role name for a GTD note, the file's basename for
  others, then `· n`: how many of its tasks match the filters (context rows
  don't count) **(decided: group counts)**.
- Within a group, tasks are in note order, and **moved tasks follow at the
  end of their target's group**, where Apply will put them **(decided: the row
  jumps to its new group)**. A task is indented by its *task* depth (one step
  per task above it, as it will be after the move). Plain bullets aren't
  shown and add no indent, but they still pass on their tags and links (as in
  `listLines`).
- Row content, left to right:
  1. Selection mark: an empty circle, or a filled accent circle with a check
     when selected. Deliberately a circle, so it can't be mistaken for the
     task's own checkbox.
  2. Task text, with tags and the estimate stripped and wikilinks styled in
     place (`textParts`, as in the search). A finished task (in its draft) is
     struck through and muted.
  3. For a moved task, a quiet `from inbox`.
  4. Tags: own tags as pills, inherited tags as fainter pills after them, so
     it's clear which ones a tag button can remove. A tag added in the draft
     has an accent outline; a tag removed in the draft stays as a faint
     struck-through pill until applied, so a removal is visible.
  5. The estimate as a quiet `20m` (`findEstimate` + `formatMinutes`)
     **(decided)**.
- **Changed rows** carry a thin accent bar at their start edge.
- **Context rows (decided):** when a task matches but a task above it doesn't,
  that ancestor shows dimmed, without a selection mark, so the tree keeps its
  shape. Context rows can't be selected or focused and don't count anywhere.
- No note letter and no depth badge as in the search: the group and the
  indentation say the same.
- Empty after filtering: one muted line, "No tasks match these filters".

### 3.2 Filters

Filters look at the end state: a task moved to today shows under the "today"
chip, and a task finished in the draft is a done task.

- **Tag chips:** `Task filter tags`, Mod+1…9. A task must carry every chip
  that is on (AND); nested tags count (`#prio/x` matches `prio`). Own and
  inherited tags both count. Same as the search.
- **GTD note chips:** the GTD notes that are set, Alt+1…4. More than one on
  means any of them (OR). Same as the search.
- **View chips**, at the end of the note row:
  - **Done:** off by default; on, finished tasks show too **(decided)**.
    Shortcut `D`.
  - **Top-level:** on, only top-level tasks show (task depth 1, so roots of a
    task hierarchy) **(decided)**. Shortcut `L`.
  These have no counts and no Mod/Alt digit; their letter is in the tooltip.
- Chip counts work as in the search ("what happens if I press this?"), counted
  against the other active filters, including the view chips.
- **Tasks changed since the last filter change stay visible** even when the
  filters would now hide them (a task just finished with Done off, a task
  moved out of the filtered note). That way nothing vanishes from under the
  cursor. The next filter change applies the filters to them again.
- **Changing a filter drops tasks from the selection that are no longer
  visible**, so an action never touches a task you can't see. Their staged
  changes stay.

### 3.3 The action bar

Always visible **(decided)**. The change buttons are disabled while nothing is
selected.

- **Row 1:** the tally on the left; **Undo**, **Discard** and **Apply** on the
  right.
  - Tally: `42 tasks`, `3 of 42 selected`, then `· 3 changed` while there are
    pending changes. "42" counts visible, selectable tasks (no context rows).
  - Undo (icon `undo-2`, Mod+Z) steps back one staged action. With no staged
    action left, it undoes the last apply (§7.4), and its tooltip says
    so: "Undo apply". It's disabled when there's neither.
  - Discard resets every pending change; disabled without any. It doesn't ask
    first: Mod+Z can't bring the changes back afterwards, but nothing was
    written, so nothing in the notes is lost.
  - **Apply n** (`--interactive-accent`, Mod+Enter) writes the pending changes;
    disabled without any. While writing, the bar shows "Applying…" and
    ignores input.
- **Row 2: tag buttons (decided: tri-state, inline in the toolbar, no picker).**
  One per filter tag, in settings order, numbered 1…9.
  - State, over the draft's own tags of the selected tasks (exact tag, not
    nested): none → outline; some → a partial mark (◐) and
    `aria-pressed="mixed"`; all → filled accent tint and `aria-pressed="true"`.
  - Pressing it when the state is none or some adds the tag to every selected
    task that lacks it; when it is all, removes it from all of them.
- **Row 3: Move to** the GTD notes that are set (Today, Someday, Overview,
  Inbox; `T S O I`), then **Finish** on the right.
  - A move button is disabled when every selected task already ends up in
    that note.
  - Finish (`X`): label **Finish** (icon `check`), or **Reopen** (icon
    `rotate-ccw`) when every selected task is done in its draft.
- On a wide window rows 2 and 3 may share one line (`flex-wrap`); on a phone
  each row scrolls horizontally instead of wrapping.

### 3.4 Closing with pending changes

**(decided: ask.)** Any way of closing (✕, Escape with nothing selected, a tap
outside, the back gesture on a phone) goes through the modal's `close()`.
With pending changes it opens a small confirm instead of closing:

> **Apply 3 changes?**
> [Keep editing]  [Discard]  [Apply]

Apply writes, then closes; Discard closes without writing; Keep editing goes
back. Without pending changes the modal just closes.

---

## 4. Selection and focus

**Selection is per row (decided):** selecting a parent doesn't select its
subtasks. Tags and finish apply to the selected rows only; a move always takes
the subtree along.

- **Tap or click** on a row toggles it: checklist behaviour, the same on touch
  and desktop. It also moves the focus there and sets the range *anchor*.
- **Shift+click** selects the range from the anchor to the clicked row
  (desktop).
- The *focus* is a separate keyboard cursor: a subtle ring, distinct from
  the selected state. It skips headings and context rows.
- **The selection stays after every action (decided)**: a staged change
  doesn't change which task a row is, so this needs nothing extra. After an
  apply or an undo of an apply the notes are read again, and the selection is
  found again as in §7.5.

---

## 5. Keyboard

Listened for on the modal element; the chip shortcuts in the capture phase
like the search, so Obsidian's Mod+digit never sees them. Letters and digits
are free because there is no text field. Ignore `event.repeat` for actions.

| Key | Does |
|---|---|
| ↑ / ↓ | Move the focus |
| Home / End | Focus the first / last task |
| Space | Toggle the focused task, set the anchor |
| Shift+↑ / Shift+↓ | Move the focus and select from the anchor to it **(decided)** |
| Mod+A | Select every visible task **(decided)** |
| Escape | Clear the selection; with nothing selected, close (§3.4) **(decided)** |
| 1…9 | Press tag button 1…9 **(decided: letter keys)** |
| T / S / O / I | Move to today / someday / overview / inbox |
| X | Finish or reopen |
| D / L | Toggle the Done / Top-level chip |
| Mod+1…9 | Toggle tag filter chip |
| Alt+1…4 | Toggle GTD note chip |
| Mod+Z | Undo (a staged action, else the last apply) |
| Mod+Enter | Apply |

- Escape: register it on the modal's `scope` and return `false` while
  something is selected, so the modal doesn't close.
- The list is a `role="listbox"` with `aria-multiselectable="true"`; rows are
  `role="option"` with `aria-selected`. The focused row is scrolled into view
  with `scrollIntoView({ block: 'nearest' })`.
- Buttons and chips show their key in `title` and `aria-keyshortcuts`, as the
  filter chips do.

---

## 6. Mobile

Designed for the phone first.

- On a phone (`body.is-phone`) the modal fills the screen: full width and
  height, no rounded outer corners, the action bar padded by
  `env(safe-area-inset-bottom)`.
- Touch targets are at least 44px high: rows, chips, toolbar buttons.
- Filter rows and toolbar rows scroll horizontally (`overflow-x: auto`, no
  scrollbar) instead of wrapping, so the header stays short and the list keeps
  its room.
- The action bar sits at the bottom, within thumb reach, and stays put while
  the list scrolls. Apply sits at the right end of its first row, where the
  thumb is.
- Tapping toggles selection; there is no long press, swipe or double tap to
  learn.
- Move buttons may show just the GTD letter with the name in `aria-label` when
  the row is too narrow (container query on the bar), with the full name on a
  wider screen.
- Staging matters most here: a tap never waits for a write, and an accidental
  back gesture asks before throwing changes away.
- On desktop: about `min(960px, 92vw)` wide and `85vh` high.

---

## 7. Applying

### 7.1 What the manager reads when it opens

For every task note: its text and its list lines (`readTaskNoteLines`, which
gains the text it read), and the tasks from them. The stored text is the
**base** of each note: every staged change is planned against it, and Apply
checks against it.

### 7.2 Planning (pure, `plan.ts`)

Input: per note its base text and list lines; per task its draft. Output: the
new text of every note that changes, where each changed task ends up
(`{ path, raw }`), and a short summary for the notice.

- **Tags**, on the task's own line only (an inherited tag can't be removed
  there):
  - Add: put ` #tag` at the end of the line, but before a trailing block id
    (`^abc`), trimming trailing whitespace first. After an estimate is fine
    (`\20 #tag` is still read as an estimate).
  - Remove: take out the exact tag only, leaving `#prio/x` alone when removing
    `#prio`, and close the gap it leaves (as `stripTag` does). The current
    `stripTag` regex (`#prio\b`) also hits `#prio/x`; the new pure function
    fixes that, with a test, and `tags.ts` uses it too.
  - Tags are compared exactly; the order of the remaining tags is kept.
- **Done:** set the marker to `x`, or to a space when reopened, on the
  task's own line **(decided: tick in place)**. Moving to "klaar" stays with
  **Move finished tasks to "klaar"**.
- **Moves (decided: move, not tag)**, as **Move line(s) to …** does them:
  - The tasks that need cutting out are the *move roots*: those that end up
    somewhere other than their parent does (or, at top level, somewhere other
    than their own note).
  - Each root takes its subtree (`listItemLines` on the list lines), except
    nested roots, which go to their own target. Roots are outdented to top
    level (`outdent`); the blank lines left behind are cleaned up as
    `withoutLines` does.
  - Taken text is appended to the end of the target, in group order then
    note order. Tag and done changes are made to the lines before they move.
  - GTD tags aren't touched.
- A note that is both a source and a target gets one new text with both.

### 7.3 Writing (`apply.ts`)

- One `vault.process` per note, the notes receiving moves first, then the
  rest, so a failure in between leaves tasks in both notes rather than in
  neither.
- **Conflict check:** inside `process`, a note whose current text isn't its
  base text changed since the manager opened.
  - Before writing anything, read every involved note and find those that
    changed. Drop the changes of tasks in them, *including moves out of them*,
    and plan again. Moves *into* a changed note still go ahead, because
    appending doesn't depend on its text.
  - If a source note changes between that check and its write (a race), its
    tasks are already appended elsewhere. They are then left in both notes,
    and the notice says so, like the existing command.
- Each note's text before and after the write is kept, for undoing the apply.
- Then: wait for the metadata cache to have parsed each written note
  (`processAndParse`), read the notes again, rebuild the list, restore the
  selection (§7.5) and clear the history. The modal stays open **(decided)**.
- One notice sums it up: `Applied: 4 moved to today, 3 tagged, 2 finished`,
  then any skips: `Skipped 2 changes in huis: the note changed since opening`.
  Skipped changes are dropped; the list now shows the note as it is, so they
  can be made again.

### 7.4 Undoing the last apply

**(decided: staged undo, plus undo of the last apply.)**

- One level: the last apply's before and after text per written note.
- Undo checks first that *every* note still holds exactly its "after" text.
  If any changed, nothing is restored, with the notice
  `Notes changed since applying; can't undo`. It's all or nothing: a
  half-undone move would lose or duplicate tasks.
- Then it writes "before" back to each note, reads the notes again, and
  restores the selection. The changes don't come back as pending: the notes
  are simply as they were.
- No redo. It's gone when the modal closes or after the next apply.
- These writes don't touch an editor's undo history; a note open in an editor
  picks them up as with any outside write.

### 7.5 Finding the selection again after a reload

Only needed after an apply or its undo. Row identity is the index in the
collected task list, which doesn't survive a reload. The plan gives
`{ path, raw }` for every task as it is after the apply (for an undo: as it was
before). After the reload, each selected task is matched to the first row with
that path and raw text not yet taken, so duplicate lines are matched in order.
A task not found again drops out of the selection.

---

## 8. Code

### 8.1 Files

A subfolder of the task feature, like `estimate/`:

```
src/tasks/
  taskitems.ts        TaskItem, noteTaskItems, taskText, textParts,
                      setTaskMarker, findTaskLine — moved out of search.ts;
                      free of Obsidian values, so the tests can build tasks
                      from a note's text
  tasknotes.ts        gains collectTaskNoteTasks, which reads the vault
  listblocks.ts       listItemLines, outdent, withoutLines — moved out of
                      gtdnotes.ts, working on ListSpan { start, end, parent }
                      so both the metadata cache (cacheSpans) and ListLine fit
  taglines.ts         pure tag edits on a line: hasOwnTag, addTag, removeTag
  manager/
    index.ts          overview + registerTaskManager(plugin): command, ribbon
    draft.ts          pure: the drafts, where a task ends up, changed tasks,
                      the history stack, discard
    model.ts          pure: filters, tree rows (groups, indent, moved tasks at
                      the end of their target, context rows), chip counts, tag
                      button states, tally
    selection.ts      pure: selected set, focus, anchor, range, prune, find
                      again by { path, raw }
    plan.ts           pure: base texts + list lines + drafts → new texts,
                      where tasks end up, summary
    apply.ts          conflict check, writes, parse wait, undo of the apply
    modal.ts          TaskManagerModal: layout, filters, keyboard, close guard
    listview.ts       renders groups and rows, mouse handling
    actionbar.ts      tally, undo/discard/apply, tag buttons, move and finish
    confirm.ts        the "Apply n changes?" modal
    draft.test.ts
    model.test.ts
    selection.test.ts
    plan.test.ts
  taskitems.test.ts
  taglines.test.ts
  listblocks.test.ts
```

Keep each file under about 250 lines; `modal.ts` delegates rendering to
`listview.ts` and `actionbar.ts`.

### 8.2 Changes to existing code (no change in behaviour)

- `search.ts` imports from `taskitems.ts`; `TaskItem` gains `ownTags`
  (`tagsOnLine(raw)`) and `parent` (the start line of the nearest *task*
  above it, or undefined).
- `shared/taskline.ts`: `ListLine` gains `parent` (the start line of the
  parent list item) and `end` (the item's last line); tests added in
  `taskline.test.ts`.
- `shared/tasknotes.ts`: `TaskNoteLines` gains `text`, the text the lines were
  read from.
- `gtdnotes.ts` imports `listItemLines`, `outdent` and `withoutLines` from
  `listblocks.ts`; `tags.ts` uses `taglines.ts`.
- `shared/ui/filterbar.ts`: an option `shortcuts?: boolean` (default true).
  With `false`, chips get no digit shortcut or digit tooltip and
  `handleKeyDown` ignores them, for the view chips. A host-supplied `title`
  per chip (`FilterChip.hint?`) shows their letter.
- `shared/vault.ts`: `processAndParse(app, file, fn)` runs `vault.process`
  and resolves once the metadata cache has parsed the result. It listens for
  `changed` before writing and compares the parsed `data` with the written
  text, like `parsedCache` in `freshcache.ts`, which can share the code.
- `tasks/index.ts`: call `registerTaskManager(plugin)`, and add to the overview
  a **Managing tasks** part and `manager/` under "Where the code is".
- `AGENTS.md`: add "task manager" to the `tasks/` line in the layout.

Commands before and after must match apart from the new `manage-tasks`
(compare with the Obsidian CLI, see AGENTS.md).

### 8.3 Dependency rules

All inside `tasks/` plus `shared/`; nothing from another feature. No new
packages.

### 8.4 Tests (`node:test`)

The pure modules carry the behaviour, so most of it is tested without
Obsidian.

- `taglines`: add before a block id, after an estimate, no duplicate, remove
  exact tag only (`#prio` vs `#prio/x`), spacing at start, middle and end.
- `listblocks`: what `gtdnotes.ts` relies on: subtree lines, outdenting with
  mixed indentation, blank line clean-up.
- `draft`: changed vs unchanged (add then remove is unchanged), where a task
  ends up through its parent, a subtask's own move overriding the parent's,
  history push/pop, discard.
- `model`: grouping order, moved tasks at the end of their target group with
  the right indent, task depth with plain bullets in between, context rows,
  Done and Top-level on the end state, AND/OR of the chips, chip counts,
  tri-state states, tally excluding context rows, changed tasks staying
  visible until the next filter change.
- `selection`: toggle, range both ways, Mod+A, prune on filter change, skip
  context rows, find again by `{ path, raw }` with duplicates.
- `plan`: whole sessions on real note texts: tag, finish and move the same
  task; parent and child both moved; child moved without its parent
  (outdented); child moved elsewhere than its parent; a note that is source
  and target; dropping the changes of a changed note; the `{ path, raw }`
  results.

Lint count must not rise above the current count (23).

---

## 9. Styling

Follow the `obsidian-styling` skill and its style guide: warm and minimal,
Obsidian variables only, no shadows, gradients or glows, weights no higher than
500, no decorative icons.

- Classes: `ronald-task-manager` on the modal, then
  `ronald-task-manager-{header,list,group,group-heading,row,mark,text,from,
  tags,tag,tag-inherited,estimate,bar,tally,tag-button,move-button,finish,
  apply}`, with state classes `is-selected`, `is-focused`, `is-context`,
  `is-done`, `is-changed`, `is-added`, `is-removed`, `is-partial`, `is-all`.
- The filter rows reuse `.ronald-task-filters` and the chip styles from the
  search unchanged.
- Spacing `--size-4-*` / `--size-2-*`, radii `--radius-s/m`, text
  `--font-ui-small` / `--font-ui-smaller`, colours `--text-normal/muted/faint`,
  `--background-primary/secondary`, `--background-modifier-border/hover`.
  Touch height `calc(var(--size-4-9) + var(--size-4-2))` (44px).
- Group heading: small, uppercase, widely tracked, `--text-muted`, like an H3
  label; the count in `--text-faint`.
- Rows: no fill at rest, `--background-modifier-hover` on hover.
  - Selected: `--background-modifier-active-hover`, with the mark filled in
    `--interactive-accent` and a `check` icon in `--text-on-accent`.
  - Focused: an inset 1px ring in `--background-modifier-border-focus`.
  - Changed: a 2px `--interactive-accent` bar on the start edge
    (`border-inline-start`, with the padding reduced to match so nothing
    shifts).
  - Context: `--text-faint`, no mark.
  - Done: struck through, `--text-muted`.
  - "from inbox": `--font-ui-smaller`, `--text-faint`.
- Tags: small pills, `--background-secondary` with a thin
  `--background-modifier-border`; inherited ones more transparent with a
  dashed border. Added: border in `--interactive-accent`. Removed:
  struck through, `--text-faint`.
- Estimate: `--font-monospace`, `--font-ui-smaller`, `--text-faint`, tabular
  figures.
- Action bar: `--background-secondary`, a thin top border, never shrinks.
  - Tag buttons: outline when off, a dashed accent border with ◐ when partial,
    an accent tint (`hsla(var(--interactive-accent-hsl), 0.15)`) when all.
  - Apply is the one button in `--interactive-accent` (Obsidian's `mod-cta`);
    Finish, Discard and Undo are quiet.
- Indentation: `padding-inline-start: calc(var(--size-4-5) * (depth - 1))`
  through a `--depth` custom property on the row; cap it at 4 levels on a
  phone.

---

## 10. Build order

Commit after each step, run `npm test` and `npm run lint`, and test in the
TestVault before the main vault.

1. **Refactors** (§8.2), no change in behaviour: `taskitems.ts`,
   `listblocks.ts`, `taglines.ts` (with the nested-tag fix), `ListLine.parent`
   and `end`, `TaskNoteLines.text`, the FilterBar option, `processAndParse`.
   Compare the command list before and after.
2. **Pure core and its tests:** `draft.ts`, `plan.ts`, then `model.ts` and
   `selection.ts`. Most of the feature is done and tested at this point,
   without any UI.
3. **Modal without writing:** list, filters, selection, keyboard, tally,
   staged changes with undo and discard; command and ribbon icon.
4. **Apply:** conflict check, writes, reload, the close confirm, then undo of
   the apply.
5. **Styling and mobile:** CSS, the phone layout, then a check on a phone (or
   the mobile emulation, `app.emulateMobile(true)`).
6. **Docs:** the overview in `tasks/index.ts`, `manager/index.ts`, AGENTS.md,
   the TestVault guide (`0-werkruimte/testvault-handleiding.md`) with what to
   try.

### TestVault checks

- Select across two notes and toggle a tag that one of them has: ◐, then all;
  the added tag shows as pending; Apply writes it.
- Move a parent and one of its subtasks to today: the row jumps to Today with
  "from …"; after Apply the subtree is there once.
- Move a subtask alone: after Apply it's outdented at the end of the note.
- Move a parent to today and its subtask to someday: each lands in its own
  note.
- Finish with Done off: the tasks stay visible, struck through, until a filter
  changes.
- Mod+Z through several staged actions; Discard; the count drops to 0.
- Edit a note in the editor while changes are pending, then Apply: that
  note's changes are skipped and reported, the rest applied.
- Undo an apply; edit a note in between and check that undo refuses.
- Close with pending changes by Escape, ✕ and a tap outside: the confirm
  appears each time.
- Shift+↓ ranges, Mod+A, then Escape twice.
- `obsidian vault=TestVault dev:errors` stays empty.
