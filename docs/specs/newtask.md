# New task

A modal to capture a task quickly and add it to one of the GTD notes, with tags, a project link and an estimate. Agreed on 2026-11-14; the code is in `src/tasks/newtask/`.

## Opening it

- The command **New task** (`plugin-van-ronald:new-task`) and a ribbon icon (`list-plus`).
- `obsidian://ronald-new-task`, which always opens the modal filled in from its parameters, so the task is checked before it is added. Every parameter is optional:

  | Parameter | Value |
  | --- | --- |
  | `text` | The task's text. |
  | `note` | `today`, `someday`, `overview` or `inbox`; anything else falls back to the inbox. |
  | `tags` | Comma-separated tags. One in **Task filter tags** switches its chip on; any other goes in the **Other tags** field. |
  | `project` | An active project by its note's name. Part of the name will do when only one project has it (`tuin-opknappen` finds `260901-tuin-opknappen`). |
  | `estimate` | Minutes, such as `20`. |

## The modal

From top to bottom:

1. The task's text, with an **add another** button (`list-plus`) and **Add** on the same row. On a phone the keyboard covers the lower half and the OS only keeps the focused field in view, so the buttons share the text's row.
2. The GTD notes that are set in settings, as chips; exactly one is on. The inbox is picked when the modal opens without a note.
3. The chips of **Task filter tags**, the same ones the task search uses.
4. Fields for other tags (separated by spaces or commas, with or without `#`), a project (suggestions from the active projects), and an estimate in minutes.
5. On desktop only, a line naming the shortcuts.

## Keys

| Key | Does |
| --- | --- |
| Enter | Adds the task, shows a notice, closes the modal. |
| Mod+Enter, or the add another button | Adds the task, shows a notice, clears the text and estimate for the next one. The note, tags and project stay. |
| Alt+A / S / D / F | Picks today / someday / overview / inbox, the letters of **Switch to GTD note**. Alt because plain letters would be typed into the field. |
| Mod+1…9 | Toggles a tag chip, as in the task search. |

On a phone the chips are tapped, and are a little bigger there. Tapping a chip or button keeps the keyboard up.

Enter in the project field is left to its suggestions, which use it to pick one.

## What it writes

The task goes on a line of its own at the end of the chosen GTD note:

```
- [ ] Bel Jan [[260901-tuin-opknappen]] \20 #prio #werk
```

- The text, then the project link, the estimate, and the tags: the estimate only counts as one when nothing but tags follows it.
- The link is made by `generateMarkdownLink`, so it follows the vault's link settings.
- A tag the text already carries isn't added again, and an estimate typed in the text wins over the field.
- Chip tags come in chip order, then the other tags as typed.

A task without text isn't added. An estimate that isn't a positive whole number, or a project that matches no active project or more than one, gives a notice and leaves the modal open.

## Where the code is

- `src/tasks/newtask/`: `modal.ts` (the modal), `taskline.ts` (the line and reading the fields, tested), `findproject.ts` (the project a typed name stands for, tested), `projectsuggest.ts`, `addtask.ts`, `urihandler.ts`, and `index.ts`, which registers the command, ribbon icon and URI.
- The a/s/d/f letters are `letter` in `GTD_NOTES` (`tasks/gtdnotes.ts`), shared with the GTD switcher.

## Projects and the dependency rules

Which projects are active rests on the project statuses, a setting of `projects/`, and `tasks/` may not import from another feature. So `main.ts` passes `activeProjectsOf(plugin)` from `projects/` to `registerTaskFeatures`, the way it passes the tab history. Without it the modal has no project field, so `tasks/` stays separable.

## Templates

Templates, the notes in the folder of the core Templates plugin (`9-sjablonen`), are never offered as a suggestion: not as a project in this modal, nor in the project link pickers, the note picker of **Move lines to note**, the backlink search, the time records, the project search or recent notes. `templateMatcher` in `shared/vault.ts` tells them. The tab switcher and the outgoing link search still show them, because they list what is open or linked.
