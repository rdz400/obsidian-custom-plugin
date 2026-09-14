/**
 * The file naming convention: `YYMMDD-` followed by a lowercase alphanumeric
 * slug whose only punctuation is the hyphen.
 *
 * The date is the file's creation time, so the name always reports when the
 * note came into being rather than when it was renamed.
 *
 * Kept free of any Obsidian import so the rules can be reasoned about — and
 * tested — on their own.
 */

/** A name already in convention: the date prefix plus a non-empty slug. */
const CONVENTION = /^\d{6}-[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** True when `basename` already follows the convention. */
export function followsConvention(basename: string): boolean {
    return CONVENTION.test(basename);
}

/** The `YYMMDD` prefix for a date, in local time. */
export function datePrefix(date: Date): string {
    const yy = String(date.getFullYear() % 100).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yy}${mm}${dd}`;
}

/**
 * `basename` with any leading date dropped.
 *
 * The creation time supplies the date, so a date already in the name is stale
 * information competing with it — and left in place it would end up duplicated
 * behind the new prefix ("260912-250101-note"). Both `YYMMDD-` and a bare
 * `YYMMDD` are recognised, as are the `YY-MM-DD` and `YYYY-MM-DD` spellings a
 * note may have been given before the convention settled.
 */
function stripLeadingDate(basename: string): string {
    const dashed = /^\d{2}(?:\d{2})?-\d{2}-\d{2}(?![\d-])(.*)$/.exec(basename);
    if (dashed) return dashed[1] ?? '';

    const plain = /^\d{6}(?!\d)(.*)$/.exec(basename);
    if (plain) return plain[1] ?? '';

    return basename;
}

/**
 * `text` as a slug: lowercase, alphanumeric, hyphen-separated.
 *
 * Accented letters are folded to their base letter rather than dropped, so
 * "café" slugs to "cafe" and not "caf". Everything else that is not a letter or
 * digit becomes a hyphen, and runs of hyphens collapse.
 */
export function slugify(text: string): string {
    return text
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * `basename` in convention, dated from `created` — the file's creation time.
 *
 * Returns null when nothing is left to name: a file called "---", or one called
 * "250101" whose whole name was the date, slugs to the empty string, and a
 * bare-prefix name is worse than the original, so the caller leaves such a file
 * alone.
 */
export function conventionalName(basename: string, created: Date): string | null {
    const slug = slugify(stripLeadingDate(basename));
    return slug === '' ? null : `${datePrefix(created)}-${slug}`;
}
