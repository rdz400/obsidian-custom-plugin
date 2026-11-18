import { takeByDestination, type TaskCache } from './reorder';
import { removeTag } from './taglines';

/**
 * The tasks left over in today at the end of the day: every task hierarchy
 * that isn't finished, for "Move open tasks to overview".
 */

/**
 * `text`, the today note, without its open task hierarchies; `taken`, those
 * hierarchies in note order with `todayTag` taken off every line; `moved`, how
 * many there are. A hierarchy whose task and checkboxes are all finished stays,
 * for "klaar", and so does everything that isn't a task hierarchy. An empty
 * `todayTag` removes no tag.
 */
export function takeLeftovers(
    text: string,
    cache: TaskCache,
    todayTag: string,
): { text: string; taken: string; moved: number } {
    const result = takeByDestination(text, cache, (_tags, finished) => (finished ? undefined : true));
    const leftovers = result.taken.get(true);
    if (!leftovers) return { text, taken: '', moved: 0 };
    const taken =
        todayTag.length === 0
            ? leftovers.text
            : leftovers.text
                  .split('\n')
                  .map((line) => removeTag(line, todayTag))
                  .join('\n');
    return { text: result.text, taken, moved: leftovers.moved };
}
