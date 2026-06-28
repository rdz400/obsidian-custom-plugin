import {
	Editor,
	MarkdownView,
	Plugin,
} from 'obsidian';

import { debounce } from "obsidian";

import {
	moveLinesToEnd,
	toggleNuTag,
	moveLinesToNote,
	toggleCheckBoxAdvanced,
	openTaakBestanden,
} from './commands';

export default class RonaldPlugin extends Plugin {

	async onload() {

		this.addCommand({
			id: 'open-taken',
			name: 'Open taken',
			callback: async () => await openTaakBestanden(this.app),
		});


		this.addCommand({
			id: 'move-lines-to-end',
			name: 'Move line(s) to end of file',
			editorCallback: (editor: Editor) => moveLinesToEnd(editor),
		});

		this.addCommand({
			id: 'toggle-nu-tag',
			name: 'Toggle #nu tag',
			editorCallback: (editor: Editor) => toggleNuTag(editor),
		});

		this.addCommand({
			id: 'move-lines-to-note',
			name: 'Move line(s) to another note',
			editorCallback: (editor: Editor) => moveLinesToNote(this.app, editor),
		});


		this.addCommand({
			id: 'toggle-checkbox-advanced',
			name: 'Toggle checkbox status advanced',
			editorCallback: toggleCheckBoxAdvanced
		});


		/*
		Andere zaken dan commands hieronder
		*/

		const statusBarItemEl = this.addStatusBarItem();
		const updateTaskCount = (editor: Editor) => {
			const content = editor.getValue();
			const tasks = content
				.split("\n")
				.filter(line => /^\s*[-*]\s+\[[ xX]\]/.test(line));

			statusBarItemEl.setText(String(tasks.length));
		};
		const onChangeDebounced = debounce(updateTaskCount, 300);

		this.registerEvent(
			this.app.workspace.on("editor-change", (editor) => {
				onChangeDebounced(editor);
			})
		);

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (view) {
					updateTaskCount(view.editor);
				} else {
					statusBarItemEl.setText("");
				}
			})
		);
	}

	onunload() {}

}
