/** Cycles a list item through checkbox states: `[ ] → [x] → [o] → [-] → plain`. */
export function toggleCheckbox(line: string): string {
    const states = ['[ ]', '[x]', '[o]', '[-]'];
    const checkboxMatch = line.match(/^(\s*[-*+]\s+)\[(.)\](\s+.*)?$/);

    if (checkboxMatch) {
        const prefix = checkboxMatch[1];
        const marker = checkboxMatch[2];
        const rest = checkboxMatch[3] ?? '';
        const current = `[${marker}]`;
        const idx = states.indexOf(current);

        if (idx >= 0) {
            return `${prefix}${states[(idx + 1) % states.length]}${rest}`;
        }
        return `${prefix}${states[0]}${rest}`;
    }

    const listMatch = line.match(/^(\s*[-*+]\s+)(.*)?$/);
    if (listMatch) {
        return `${listMatch[1]}[ ] ${listMatch[2] ?? ''}`;
    }

    return line;
}
