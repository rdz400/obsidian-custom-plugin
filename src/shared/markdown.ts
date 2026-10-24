/**
 * A wikilink: the target in group 1 (without heading or block part), the
 * display text, when given, in group 2.
 */
export const LINK_RE = /\[\[([^\]|#^]+?)(?:[#^][^\]|]*)?(?:\|([^\]]*))?\]\]/g;

/** The wikilink targets on one line, using the display text where given. */
export function linksOnLine(raw: string): string[] {
    return Array.from(raw.matchAll(LINK_RE)).map((m) => (m[2] ?? m[1] ?? '').trim());
}

/** Append the entries of `extra` that `into` doesn't already have. */
export function addMissing(into: string[], extra: string[]): string[] {
    return [...into, ...extra.filter((entry) => !into.includes(entry))];
}
