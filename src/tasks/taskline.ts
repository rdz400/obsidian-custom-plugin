/** A checkbox list line: the list marker, then the checkbox with its marker. */
const TASK_LINE_RE = /^(\s*[-*+]\s+)\[([^\]])\]\s?/;

/** The checkbox marker of a task line ("x" for "- [x] Foo"), or undefined for any other line. */
export function taskMarker(line: string): string | undefined {
    return TASK_LINE_RE.exec(line)?.[2];
}

/** Whether a checkbox marker means the task is finished. */
export function isDoneMarker(marker: string): boolean {
    return marker === 'x' || marker === 'X';
}
