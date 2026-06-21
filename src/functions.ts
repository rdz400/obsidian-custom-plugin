import { Editor, MarkdownView, MarkdownFileInfo } from "obsidian"


export function listTasksCurrentEditor(editor: Editor, _ctx: MarkdownView | MarkdownFileInfo) {
    const content = editor.getValue();
    const tasks = content
        .split("\n")
        .filter(line => /^\s*[-*]\s+\[[ xX]\]/.test(line));
    console.log(String(tasks.length));
}
