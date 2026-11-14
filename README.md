# Personal Obsidian Plugin

A personal Obsidian plugin for custom functionality tailored to my workflow.

## Development

- `npm i` to install dependencies
- `npm run dev` to start compilation in watch mode
- `npm test` to run the unit tests (Node 22.18 or later)

## Installation

Run `./to-vault.sh` to build, copy files to the vault, and reload the plugin. Pass `restart` to also restart Obsidian:

```sh
./to-vault.sh          # build + reload
./to-vault.sh restart  # build + full restart
```

Requires the `VAULT_OBSIDIAN` environment variable to point to your vault directory.

## URIs

The plugin handles six `obsidian://` actions, for links in notes and for shortcuts outside Obsidian. It never builds these URIs itself; they are written by hand wherever they are used. Every parameter is optional, and the bare URI does what the matching command does.

| URI | Does | Parameters |
| --- | --- | --- |
| `obsidian://ronald-tasks` | Opens **Search tasks** | `query`, `tags`, `notes`, `done` |
| `obsidian://ronald-new-task` | Opens **New task**, filled in | `text`, `note`, `tags`, `project`, `estimate` |
| `obsidian://ronald-projects` | Opens **Search projects** | `query`, `status`, `tasks` |
| `obsidian://ronald-timerecord` | Opens **Add time record** | `message` |
| `obsidian://ronald-timerecord-search` | Opens **Search time records** | `query`, `days` |
| `obsidian://ronald-tijdsregistratie` | Opens the "tijdsregistratie" note at its last line | none |

### `ronald-tasks`

- `query`: text to put in the search field.
- `tags`: comma-separated tag chips to switch on, such as `tags=prio,vandaag`. Only tags in **Task filter tags** have a chip; others are ignored.
- `notes`: comma-separated GTD note chips to switch on: `today`, `someday`, `overview`, `inbox`.
- `done=true`: also lists finished tasks.

```
obsidian://ronald-tasks?query=bel&tags=prio,vandaag&notes=today,inbox&done=true
```

### `ronald-new-task`

Always opens the modal, so the task is checked before **Add** (or Enter) writes it to the end of the GTD note.

- `text`: the task's text.
- `note`: the GTD note to add to: `today`, `someday`, `overview` or `inbox`. Without it, or with another value, the inbox.
- `tags`: comma-separated tags, such as `tags=prio,werk`. A tag in **Task filter tags** switches its chip on; any other goes in the **Other tags** field.
- `project`: an active project, by its note's name. Part of the name will do when only one project has it, so `project=tuin-opknappen` finds `260901-tuin-opknappen`.
- `estimate`: the estimate in minutes, such as `estimate=20`.

```
obsidian://ronald-new-task?text=Bel%20Jan&note=today&tags=prio,werk&project=tuin-opknappen&estimate=20
```

### `ronald-projects`

- `query`: text to put in the search field.
- `status`: comma-separated status chips to switch on, one per status in **Settings → Plugin van Ronald → Project statuses**: `actief`, `backlog`, `misschien`, `wachten`, `klaar`, `geannuleerd` by default.
- `tasks`: `met` for projects with open tasks, `zonder` for projects without (`met-taken` and `zonder-taken` work too).

```
obsidian://ronald-projects?query=tuin&status=actief,wachten&tasks=met
```

### `ronald-timerecord`

- `message`: the record's text. With it, the record is added straight away without the dialog, which suits a shortcut for one fixed event.

```
obsidian://ronald-timerecord?message=Lunch
```

### `ronald-timerecord-search`

- `query`: text to put in the search field.
- `days`: comma-separated weekday chips to switch on. A day is a chip's label (`ma`, `di`, `wo`, `do`, `vr`, `za`, `zo`) or its full name in Dutch or English (`maandag`, `monday`).

```
obsidian://ronald-timerecord-search?query=overleg&days=ma,donderdag
```

### How values are read

In `tags`, `notes`, `status` and `days`, a leading `#` is dropped and capitals are folded to lower case, so `tags=#Prio` works. A value without a matching chip is ignored rather than reported. URL-encode spaces and special characters in `query`, `message`, `text` and `project` (`Overleg%20met%20Jan`).

### Where the code is

Each action is handled in its feature's `urihandler.ts`, registered from that feature's `index.ts`:

| Action | Handler | Opens |
| --- | --- | --- |
| `ronald-tasks` | `src/tasks/urihandler.ts` | `searchTasks` in `src/tasks/search.ts` |
| `ronald-new-task` | `src/tasks/newtask/urihandler.ts` | `newTask` in `src/tasks/newtask/modal.ts` |
| `ronald-projects` | `src/projects/urihandler.ts` | `searchProjects` in `src/projects/search.ts` |
| `ronald-timerecord` | `src/timerecord/urihandler.ts` | `addTimeRecord` in `src/timerecord/addtimerecord.ts` |
| `ronald-timerecord-search` | `src/timerecord/urihandler.ts` | `searchTimeRecords` in `src/timerecord/history/index.ts` |
| `ronald-tijdsregistratie` | `src/timerecord/urihandler.ts` | `openTimeRecordNote` in `src/timerecord/timerecordnote.ts` |

`src/shared/uri.ts` has `parseValues`, which splits the comma-separated chip parameters for the searches and the tags of `ronald-new-task`.

The action names and their parameters are stable identifiers (see `AGENTS.md`): links in notes and shortcuts depend on them, so renaming one breaks those links. A new parameter goes in the handler's `…UriParams` interface, the feature overview in its `index.ts`, and this section.
