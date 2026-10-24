# Plugin van Ronald

## Project overview

- A personal Obsidian plugin (TypeScript → bundled JavaScript) for one vault. It is not released or published to the community catalog; it is deployed straight into the vault with `to-vault.sh`.
- Entry point: `src/main.ts` compiled to `main.js` and loaded by Obsidian.
- What Obsidian loads: `main.js`, `manifest.json` and `styles.css` in the vault's plugin folder.

## Environment & tooling

- Node.js: use current LTS (Node 18+ recommended).
- **Package manager: npm** (required for this sample - `package.json` defines npm scripts and dependencies).
- **Bundler: esbuild** (required for this sample - `esbuild.config.mjs` and build scripts depend on it). Alternative bundlers like Rollup or webpack are acceptable for other projects if they bundle all external dependencies into `main.js`.
- Types: `obsidian` type definitions.

**Note**: This sample project has specific technical dependencies on npm and esbuild. If you're creating a plugin from scratch, you can choose different tools, but you'll need to replace the build configuration accordingly.

### Install

```bash
npm install
```

### Dev (watch)

```bash
npm run dev
```

### Production build

```bash
npm run build
```

## Linting

- ESLint is preconfigured with `eslint-plugin-obsidianmd` for Obsidian-specific rules.
- Run `npm run lint` to lint the project.
- A GitHub Action automatically lints every commit on all branches.
- Lint already reports problems in existing code (23 as of October 2026). Don't add new ones: compare the count before and after a change.

## File & folder conventions

- Source lives in `src/`, organised by feature. Each feature folder has an `index.ts` with one `register…(plugin)` function that adds its commands, ribbon icons, URI handlers and status bar items. `main.ts` only loads the settings, holds state that several features share (the tab history) and calls those functions.
    ```
    src/
      main.ts           # Lifecycle: settings, tab history, one register call per feature
      settings/         # RonaldSettings (each feature's settings combined), the settings tab
      shared/           # Code features share: ui/ (modals, filter bar), editor/ (line helpers), task lines and task notes, tab history and tab helpers, vault, markdown, date, uri
      tasks/            # Task notes, task search, tags, GTD notes and switcher, estimates, task count
      projects/         # Project search (with open task counts), project commands and statuses
      links/            # Backlink and outgoing link searches, copy wikilink
      navigation/       # Outline, recent notes, tab switcher
      editing/          # Selecting and moving lines
      timerecord/       # The "tijdsregistratie" note
      naming/           # File naming convention
    ```
- **Settings per feature**: a feature with settings has a `settings.ts` with its settings interface, defaults and settings tab sections. `settings/index.ts` combines the interfaces into `RonaldSettings` and the defaults into `DEFAULT_SETTINGS`; `settings/tab.ts` lists each feature's sections. All keys are stored side by side in one `data.json`, so a key must be unique across features. Code inside a feature takes its own settings type (`TaskSettings`), not `RonaldSettings`.
- **Dependency rules**:
    - `shared/` never imports from a feature folder.
    - Every feature uses only `shared/`, never another feature. That keeps each feature separable; `tasks/` in particular could become a plugin of its own later.
    - What two features both need (such as telling a task line, finding the task notes, or the tab history) belongs in `shared/`.
    - `settings/` imports each feature's `settings.ts`, and nothing else from the features.
    - Importing the `RonaldPlugin` type from `main.ts`, and `settings/section.ts` from a feature's `settings.ts`, is fine everywhere.
    - `npm run lint` enforces these rules (`no-restricted-imports`, set up from the `FEATURES` list in `eslint.config.mts`). A change to the rules is made there and here together.
- **Where new code goes**:
    - New functionality for an existing feature goes in that feature's folder, registered from its `index.ts`.
    - Something that doesn't fit any feature gets a new feature folder: an `index.ts` with an overview and a `register…(plugin)` function, one call to it in `main.ts`, and a line for it in the layout above. Decide its dependency rule, add it to the list above and add the folder to `FEATURES` in `eslint.config.mts`; a folder missing there isn't checked.
    - Code moves to `shared/` only once a second feature needs it, and it stays free of feature knowledge (no commands, no feature settings).
- **Feature overviews**: each feature's `index.ts` starts with an explanation of the feature: what it is for, how to use it (commands, ribbon icons, URIs, settings), and which file does what. Update it in the same change as the feature: a new or renamed command, URI parameter, setting or file.
- **File names**: lower case, no separators (`tasknotes.ts`, `linecommands.ts`). The main file of a feature is `index.ts`; settings are in `settings.ts`; URI handlers in `urihandler.ts`.
- **Do not commit build artifacts**: Never commit `node_modules/`, `main.js`, or other generated files to version control.
- Keep the plugin small. Avoid large dependencies. Prefer browser-compatible packages.
- The build writes `main.js` to the project root; `to-vault.sh` copies it with `manifest.json` and `styles.css` to the top level of the plugin folder in the vault.


## Definitions

### Task hierarchy terminology

These terms are used in the code in `src/tasks/` (see `reorder.ts` and `gtdnotes.ts`).

- A **task hierarchy** is a top-level task and all of its nested subtasks.
- A task hierarchy always starts with a **top-level task**.
- A **subtask** cannot be the root of a task hierarchy.
- A **subtree** refers to any task and all of its descendants, including subtasks.

Example:

```markdown
- [ ] test        ← top-level task / root of task hierarchy
  - [ ] abc      ← subtask
    - [ ] def    ← nested subtask
```
In this example:
`test` + `abc` + `def` = the task hierarchy rooted at test
`abc` + `def` = a subtree, but not a task hierarchy
`def` = a leaf task

## Manifest rules (`manifest.json`)

- Must include (non-exhaustive):
    - `id` (plugin ID; for local dev it should match the folder name)
    - `name`
    - `version` (Semantic Versioning `x.y.z`)
    - `minAppVersion`
    - `description`
    - `isDesktopOnly` (boolean)
    - Optional: `author`, `authorUrl`, `fundingUrl` (string or map)
- Never change `id` (`plugin-van-ronald`): it names the plugin folder in the vault, where `data.json` lives, and it prefixes every command ID, so hotkeys depend on it.
- Keep `minAppVersion` accurate when using newer APIs.

## Testing & deployment

- Use `to-vault.sh` to test and deploy. It builds the plugin, copies `main.js`, `manifest.json`, and `styles.css` into the vault's plugin folder, and reloads the plugin in Obsidian:
    ```bash
    ./to-vault.sh
    ```
- If `manifest.json` changed, run it with the `restart` argument so Obsidian restarts and picks up the new manifest:
    ```bash
    ./to-vault.sh restart
    ```
- The script expects `$VAULT_OBSIDIAN` to point at the vault and deploys to `<Vault>/.obsidian/plugins/plugin-van-ronald/`.
- Enable the plugin once in **Settings → Community plugins**.
- After a change that moves code around without meaning to change behaviour, compare the plugin's commands before and after, for example with the Obsidian CLI: `obsidian eval code="Object.keys(app.commands.commands).filter(id => id.startsWith('plugin-van-ronald:')).sort().join('\n')"`.

## Commands & settings

- Add commands with `plugin.addCommand(...)` in the feature's `register…` function, never in `main.ts`.
- Read settings when a command runs (`plugin.settings.x` inside the callback), not when it is registered, so a change in settings needs no reload. Where that isn't possible (one command per list entry), say in the setting's heading that a reload is needed.
- Persist settings with `plugin.saveSettings()`.
- **Stable identifiers**: these are referenced from outside the code and must not be renamed:
    - Command IDs: hotkeys are bound to them.
    - Setting keys: they are the keys in `data.json`.
    - URI actions (`ronald-tasks`, `ronald-projects`, `ronald-timerecord`, `ronald-tijdsregistratie`) and their parameters: links in notes and shortcuts use them.
    - CSS classes (`ronald-…`): `styles.css` and snippets use them.
    - Moving code between folders never requires changing any of these.
- **Removing a setting**: drop it from the feature's interface and defaults. Its key stays in the user's `data.json` (settings are loaded with `Object.assign`), so say in the commit that the old key can be removed.

## Versions & tags

- There are no releases: the vault always runs what `to-vault.sh` last deployed. `version` in `manifest.json` stays as it is unless asked to change it.
- Milestones in the history get an annotated git tag with a descriptive name and a message saying what it marks, such as `reorganisation-2026-10`. List them with `git tag -n`.

## Security, privacy, and compliance

Follow Obsidian's **Developer Policies** and **Plugin Guidelines**. In particular:

- Default to local/offline operation. Only make network requests when essential to the feature.
- No hidden telemetry. If you collect optional analytics or call third-party services, require explicit opt-in and document clearly in `README.md` and in settings.
- Never execute remote code, fetch and eval scripts, or update plugin code other than by deploying a build.
- Minimize scope: read/write only what's necessary inside the vault. Do not access files outside the vault.
- Clearly disclose any external services used, data sent, and risks.
- Respect user privacy. Do not collect vault contents, filenames, or personal information unless absolutely necessary and explicitly consented.
- Avoid deceptive patterns, ads, or spammy notifications.
- Register and clean up all DOM, app, and interval listeners using the provided `register*` helpers so the plugin unloads safely.

## UX & copy guidelines (for UI text, commands, settings)

- Prefer sentence case for headings, buttons, and titles.
- Use clear, action-oriented imperatives in step-by-step copy.
- Use **bold** to indicate literal UI labels. Prefer "select" for interactions.
- Use arrow notation for navigation: **Settings → Community plugins**.
- Keep in-app strings short, consistent, and free of jargon.

## Performance

- Keep startup light. Defer heavy work until needed.
- Avoid long-running tasks during `onload`; use lazy initialization.
- Batch disk access and avoid excessive vault scans.
- Debounce/throttle expensive operations in response to file system events.

## Coding conventions

- TypeScript with `"strict": true` preferred.
- **Keep `main.ts` minimal**: only the plugin lifecycle and one register call per feature; no commands and no feature logic.
- **Split large files**: If any file exceeds ~200-300 lines, consider breaking it into smaller, focused modules.
- **Use clear module boundaries**: Each file should have a single, well-defined responsibility.
- Bundle everything into `main.js` (no unbundled runtime deps).
- Avoid Node/Electron APIs if you want mobile compatibility; set `isDesktopOnly` accordingly.
- Prefer `async/await` over promise chains; handle errors gracefully.

## Mobile

- Where feasible, test on iOS and Android.
- Don't assume desktop-only behavior unless `isDesktopOnly` is `true`.
- Avoid large in-memory structures; be mindful of memory and storage constraints.

## Agent do/don't

**Do**

- Keep command IDs stable (don't rename them; hotkeys are bound to them).
- Provide defaults and validation in settings.
- Write idempotent code paths so reload/unload doesn't leak listeners or intervals.
- Use the `plugin.register*` helpers for everything that needs cleanup.

**Don't**

- Introduce network calls without an obvious user-facing reason and documentation.
- Ship features that require cloud services without clear disclosure and explicit opt-in.
- Store or transmit vault contents unless essential and consented.

## Common tasks

### Add a command to a feature

In the feature's `index.ts`, inside its register function, with the logic in a file of its own:

```ts
plugin.addCommand({
    id: 'do-the-thing',
    name: 'Do the thing',
    icon: 'sparkles',
    callback: () => doTheThing(plugin.app, plugin.settings.someSetting),
});
```

Then add the command to the "How to use it" part of the overview at the top of the file.

### Add a feature

`src/reading/index.ts`:

```ts
/**
 * Reading
 * =======
 *
 * What the feature is for, in a few sentences.
 *
 * How to use it
 * -------------
 * - "Do the thing" does …
 *
 * Where the code is
 * -----------------
 * - dothething.ts   the command
 */

import type RonaldPlugin from '../main';
import { doTheThing } from './dothething';

/** Register the reading features. */
export function registerReading(plugin: RonaldPlugin): void {
    plugin.addCommand({ /* … */ });
}
```

Call `registerReading(this)` in `onload` in `main.ts`, add the folder to the layout and the dependency rules under **File & folder conventions**, and add `reading` to `FEATURES` in `eslint.config.mts`.

### Add a setting

In the feature's `settings.ts` (create it if the feature has none yet):

```ts
export interface ReadingSettings {
    /** What the setting does. */
    readingFolder: string;
}

export const DEFAULT_READING_SETTINGS: ReadingSettings = {
    readingFolder: '',
};

export function readingSettingSections({ plugin, save }: SettingSectionContext): SettingDefinitionItem[] {
    return [/* … */];
}
```

For a feature's first setting, also add `ReadingSettings` to `RonaldSettings`, `DEFAULT_READING_SETTINGS` to `DEFAULT_SETTINGS` (both in `settings/index.ts`) and `readingSettingSections` to `settings/tab.ts`.

### Register listeners safely

```ts
plugin.registerEvent(
	plugin.app.workspace.on('file-open', (f) => {
		/* ... */
	}),
);
plugin.registerDomEvent(activeWindow, 'resize', () => {
	/* ... */
});
plugin.registerInterval(
	window.setInterval(() => {
		/* ... */
	}, 1000),
);
```

## Troubleshooting

- Plugin doesn't load after build: ensure `main.js` and `manifest.json` are at the top level of the plugin folder under `<Vault>/.obsidian/plugins/<plugin-id>/`.
- Build issues: if `main.js` is missing, run `npm run build` or `npm run dev` to compile your TypeScript source code.
- Commands not appearing: verify the feature's register function is called from `onload` in `main.ts`, and that IDs are unique.
- Settings not persisting: ensure `loadData`/`saveData` are awaited and you re-render the UI after changes.
- Mobile-only issues: confirm you're not using desktop-only APIs; check `isDesktopOnly` and adjust.

## References

- Obsidian sample plugin: https://github.com/obsidianmd/obsidian-sample-plugin
- API documentation: https://docs.obsidian.md
- Developer policies: https://docs.obsidian.md/Developer+policies
- Plugin guidelines: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
- Style guide: https://help.obsidian.md/style-guide
