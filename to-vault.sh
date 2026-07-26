#!/usr/bin/env bash

plugin_dir="$VAULT_OBSIDIAN/.obsidian/plugins"
sample_plugin="$plugin_dir/plugin-van-ronald"

echo $sample_plugin

npm run build

cp main.js "$sample_plugin"/
cp styles.css "$sample_plugin"/
cp manifest.json "$sample_plugin"/

obsidian plugin:reload id=plugin-van-ronald

if [[ "${1:-}" == "restart" ]]; then obsidian restart; fi
