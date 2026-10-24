/**
 * Format `date` with the subset of moment tokens used by daily-note formats.
 * Longest tokens first so `YYYY` wins over `YY`, `MM` over `M`, etc.
 */
export function formatDate(date: Date, format: string): string {
    const tokens: Record<string, string> = {
        YYYY: String(date.getFullYear()),
        YY: String(date.getFullYear()).slice(2),
        MM: pad2(date.getMonth() + 1),
        M: String(date.getMonth() + 1),
        DD: pad2(date.getDate()),
        D: String(date.getDate()),
        HH: pad2(date.getHours()),
        mm: pad2(date.getMinutes()),
        ss: pad2(date.getSeconds()),
    };
    // `[...]` escapes literal text in moment formats; leave its contents alone.
    return format.replace(
        /\[([^\]]*)\]|YYYY|YY|MM|M|DD|D|HH|mm|ss/g,
        (match: string, literal?: string) =>
            literal !== undefined ? literal : tokens[match] ?? match,
    );
}

/** Zero-pad a number to two digits. */
function pad2(n: number): string {
    return String(n).padStart(2, '0');
}
