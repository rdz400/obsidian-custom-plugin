/**
 * A wikilink: the target in group 1 (without heading or block part), the
 * display text, when given, in group 2.
 */
export const LINK_RE = /\[\[([^\]|#^]+?)(?:[#^][^\]|]*)?(?:\|([^\]]*))?\]\]/g;

/** An inline tag: the name, without `#`, in group 1. */
export const TAG_RE = /#([\w/-]+)/g;

/** The wikilink targets on one line, using the display text where given. */
export function linksOnLine(raw: string): string[] {
    return Array.from(raw.matchAll(LINK_RE)).map((m) => (m[2] ?? m[1] ?? '').trim());
}

/** The inline "#tag"s written on one line, lowercased and without `#`. */
export function tagsOnLine(raw: string): string[] {
    return Array.from(raw.matchAll(TAG_RE)).map((m) => (m[1] as string).toLowerCase());
}

/** Append the entries of `extra` that `into` doesn't already have. */
export function addMissing(into: string[], extra: string[]): string[] {
    return [...into, ...extra.filter((entry) => !into.includes(entry))];
}
