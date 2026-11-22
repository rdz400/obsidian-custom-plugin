import { TAG_RE, tagsOnLine } from '../shared/markdown';

/** A record's text with the tags that have a chip taken out of it. */
export interface TaggedText {
    /** The text without those tags, spaces tidied up. */
    text: string;
    /** The tags taken out, lower case and without `#`, in the order they were written. */
    tags: string[];
}

/**
 * Take the tags in `known` out of a record's text: "Overleg #Werk met Jan"
 * with `werk` known gives "Overleg met Jan" and `werk`. Other tags stay in
 * the text as written.
 */
export function splitTags(text: string, known: ReadonlySet<string>): TaggedText {
    const tags: string[] = [];
    const rest = text.replace(TAG_RE, (tag, name: string) => {
        const lower = name.toLowerCase();
        if (!known.has(lower)) return tag;
        if (!tags.includes(lower)) tags.push(lower);
        return '';
    });
    return { text: rest.replace(/\s+/g, ' ').trim(), tags };
}

/**
 * The text with `tags` at the end of the line, each as "#tag": "Overleg
 * #werk". A tag the text already carries isn't added again.
 */
export function withTags(text: string, tags: readonly string[]): string {
    const own = tagsOnLine(text);
    const added = [...new Set(tags)].filter((tag) => !own.includes(tag));
    return [text.trim(), ...added.map((tag) => `#${tag}`)].join(' ');
}
