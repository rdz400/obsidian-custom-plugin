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
