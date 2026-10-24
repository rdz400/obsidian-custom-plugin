/**
 * Split a comma-separated parameter into the values the filter bar uses.
 *
 * A hand-written link is likely to spell a tag the way it reads in a note, so a
 * leading "#" is accepted and capitals are folded away; the chips themselves are
 * lowercase and unprefixed.
 */
export function parseValues(value: string | undefined): string[] {
    if (!value) return [];
    return value
        .split(',')
        .map((entry) => entry.trim().replace(/^#/, '').toLowerCase())
        .filter((entry) => entry.length > 0);
}
