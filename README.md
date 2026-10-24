# Personal Obsidian Plugin

A personal Obsidian plugin for custom functionality tailored to my workflow.

## Development

- `npm i` to install dependencies
- `npm run dev` to start compilation in watch mode

## Installation

Run `./to-vault.sh` to build, copy files to the vault, and reload the plugin. Pass `restart` to also restart Obsidian:

```sh
./to-vault.sh          # build + reload
./to-vault.sh restart  # build + full restart
```

Requires the `VAULT_OBSIDIAN` environment variable to point to your vault directory.

## URIs

The plugin handles four `obsidian://` actions, for links in notes and for shortcuts outside Obsidian. It never builds these URIs itself; they are written by hand wherever they are used. Every parameter is optional, and the bare URI does what the matching command does.

| URI | Does | Parameters |
| --- | --- | --- |
| `obsidian://ronald-tasks` | Opens **Search tasks** | `query`, `tags`, `notes`, `done` |
| `obsidian://ronald-projects` | Opens **Search projects** | `query`, `status`, `tasks` |
| `obsidian://ronald-timerecord` | Opens **Add time record** | `message` |
| `obsidian://ronald-tijdsregistratie` | Opens the "tijdsregistratie" note at its last line | none |

### `ronald-tasks`

- `query`: text to put in the search field.
- `tags`: comma-separated tag chips to switch on, such as `tags=nu,vandaag`. Only tags in **Task filter tags** have a chip; others are ignored.
- `notes`: comma-separated GTD note chips to switch on: `today`, `someday`, `overview`, `inbox`.
- `done=true`: also lists finished tasks.

```
obsidian://ronald-tasks?query=bel&tags=nu,vandaag&notes=today,inbox&done=true
```

### `ronald-projects`

- `query`: text to put in the search field.
- `status`: comma-separated status chips to switch on: `actief`, `backlog`, `misschien`, `wachten`.
- `tasks`: `met` for projects with open tasks, `zonder` for projects without (`met-taken` and `zonder-taken` work too).

```
obsidian://ronald-projects?query=tuin&status=actief,wachten&tasks=met
```

### `ronald-timerecord`

- `message`: the record's text. With it, the record is added straight away without the dialog, which suits a shortcut for one fixed event.

```
obsidian://ronald-timerecord?message=Lunch
```

### How values are read

In `tags`, `notes` and `status`, a leading `#` is dropped and capitals are folded to lower case, so `tags=#Nu` works. A value without a matching chip is ignored rather than reported. URL-encode spaces and special characters in `query` and `message` (`Overleg%20met%20Jan`).

### Where the code is

Each action is handled in its feature's `urihandler.ts`, registered from that feature's `index.ts`:

| Action | Handler | Opens |
| --- | --- | --- |
| `ronald-tasks` | `src/tasks/urihandler.ts` | `searchTasks` in `src/tasks/search.ts` |
| `ronald-projects` | `src/projects/urihandler.ts` | `searchProjects` in `src/projects/search.ts` |
| `ronald-timerecord` | `src/timerecord/urihandler.ts` | `addTimeRecord` in `src/timerecord/addtimerecord.ts` |
| `ronald-tijdsregistratie` | `src/timerecord/urihandler.ts` | `openTimeRecordNote` in `src/timerecord/timerecordnote.ts` |

`src/shared/uri.ts` has `parseValues`, which splits the comma-separated chip parameters for both searches.

The action names and their parameters are stable identifiers (see `AGENTS.md`): links in notes and shortcuts depend on them, so renaming one breaks those links. A new parameter goes in the handler's `…UriParams` interface, the feature overview in its `index.ts`, and this section.
