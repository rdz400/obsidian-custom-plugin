import {
	App,
	Editor,
	FuzzySuggestModal,
	Notice,
	EditorPosition,
	TFile,
} from 'obsidian';
import { toggleCheckbox } from './functions';


/** Open bestanden Obsidian */
export async function openTaakBestanden(app: App) {

	const files = app.vault.getMarkdownFiles().filter(
		file => {
			if (file.path.startsWith("9-sjablonen/")) return false;
			const cache = app.metadataCache.getFileCache(file);
			return cache?.frontmatter?.type === "taken";
		}
	)

	for (const file of files) {
		const leaf = app.workspace.getLeaf("tab");
		await leaf.openFile(file);
	}

}

/** Move the selected lines to the end of the document. */
export function moveLinesToEnd(editor: Editor) {
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

/** Toggle the `#nu` tag on selected list items. */
export function toggleNuTag(editor: Editor) {
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

/** Move the selected lines to a chosen note via a fuzzy-search modal. */
export function moveLinesToNote(app: App, editor: Editor) {
	const from = editor.getCursor("from");
	const to = editor.getCursor("to");
	const lines: string[] = [];
	for (let i = from.line; i <= to.line; i++) {
		lines.push(editor.getLine(i));
	}
	const text = lines.join("\n");

	new NoteSuggestModal(app, async (file: TFile) => {
		const content = await app.vault.read(file);
		const separator = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
		await app.vault.modify(file, content + separator + text + "\n");

		const removeFrom = from.line;
		const removeTo = to.line;
		if (removeFrom === 0 && removeTo < editor.lastLine()) {
			editor.replaceRange(
				"",
				{ line: removeFrom, ch: 0 },
				{ line: removeTo + 1, ch: 0 },
			);
		} else if (removeFrom > 0) {
			editor.replaceRange(
				"",
				{ line: removeFrom - 1, ch: editor.getLine(removeFrom - 1).length },
				{ line: removeTo, ch: editor.getLine(removeTo).length },
			);
		} else {
			editor.replaceRange(
				"",
				{ line: 0, ch: 0 },
				{ line: 0, ch: editor.getLine(0).length },
			);
		}

		new Notice(`Moved to ${file.basename}`);
	}).open();
}


export function toggleCheckBoxAdvanced(editor: Editor) {
	const cursor = editor.getCursor();
	const anchor = editor.getCursor('anchor');
	const line = editor.getLine(cursor.line);
	const toggled = toggleCheckbox(line);
	const delta = toggled.length - line.length;
	editor.setLine(cursor.line, toggled);

	if (cursor.line === anchor.line && cursor.ch !== anchor.ch) {
		const newCursor = { line: cursor.line, ch: Math.max(0, cursor.ch + delta) };
		const newAnchor = { line: anchor.line, ch: Math.max(0, anchor.ch + delta) };
		editor.setSelection(newAnchor, newCursor);
	} else {
		const distFromEnd = line.length - cursor.ch;
		editor.setCursor({ line: cursor.line, ch: Math.max(0, toggled.length - distFromEnd) });
	}
}

class NoteSuggestModal extends FuzzySuggestModal<TFile> {
	private onChoose: (file: TFile) => void;

	constructor(app: App, onChoose: (file: TFile) => void) {
		super(app);
		this.onChoose = onChoose;
	}

	getItems(): TFile[] {
		return this.app.vault.getMarkdownFiles();
	}

	getItemText(item: TFile): string {
		return item.path;
	}

	onChooseItem(item: TFile): void {
		this.onChoose(item);
	}
}

