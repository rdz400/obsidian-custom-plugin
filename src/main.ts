import {
	Editor,
	MarkdownView,
	Modal,
	Plugin,
	EditorPosition,
} from 'obsidian';

import { debounce } from "obsidian";

// Remember to rename these classes and interfaces!

export default class RonaldPlugin extends Plugin {

	async onload() {


		this.addCommand({
			id: 'move-lines-to-end',
			name: 'Move line(s) to end of file',
			editorCallback: (editor: Editor) => {
				const from = editor.getCursor("from");
				const to = editor.getCursor("to");
				const lines: string[] = [];
				for (let i = from.line; i <= to.line; i++) {
					lines.push(editor.getLine(i));
				}
				const lastLine = editor.lastLine();
				const lastLineText = editor.getLine(lastLine);
				editor.replaceRange(
					"\n" + lines.join("\n"),
					{ line: lastLine, ch: lastLineText.length },
				);
				const removeFrom = from.line;
				const removeTo = to.line;
				if (removeFrom === 0 && removeTo < editor.lastLine()) {
					editor.replaceRange(
						"",
						{ line: removeFrom, ch: 0 },
						{ line: removeTo + 1, ch: 0 },
					);
				} else {
					editor.replaceRange(
						"",
						{ line: removeFrom - 1, ch: editor.getLine(removeFrom - 1).length },
						{ line: removeTo, ch: editor.getLine(removeTo).length },
					);
				}
			}
		});

		this.addCommand({
			id: 'toggle-nu-tag',
			name: 'Toggle #nu tag',
			editorCallback: (editor: Editor) => {
				const from: EditorPosition = editor.getCursor("from");
				const to: EditorPosition = editor.getCursor("to");
				for (let i = from.line; i <= to.line; i++) {
					const line = editor.getLine(i);
					if (!/^\s*[-*]\s/.test(line)) continue;
					if (/(?<!\w)#nu\b/.test(line)) {
						editor.setLine(i, line.replace(/ ?#nu\b ?/g, (m, offset, str: string) => {
							if (offset === 0) return '';
							if (offset + m.length === str.length) return '';
							return ' ';
						}));
					} else {
						editor.setLine(i, line + ' #nu');
					}
				}
			}
		});

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

		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'open-modal-complex',
			name: 'Open modal (complex)',
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView =
					this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new SampleModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
				return false;
			},
		});

	}

	onunload() {}

}

class SampleModal extends Modal {
	onOpen() {
		const { contentEl } = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
