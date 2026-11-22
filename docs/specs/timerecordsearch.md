# Time record search

**Search time records** looks back through the time record history: what was done when, how long it took, and how much time went to one kind of thing. This spec describes the search as a whole, as it stands after the changes agreed on 2026-11-22 (filters for the time of day and tags, the total, tags shown as tags, narrower margins, days past midnight, and records taken to be in order). The code is in `src/timerecord/history/`.

## Opening it

- The command **Search time records** (`plugin-van-ronald:search-time-records`, icon `history`).
- `obsidian://ronald-timerecord-search`, optionally with `query=…` for the search field and `days=ma,donderdag` for the weekday chips. A day is a chip's label or a full name, Dutch or English. The URI doesn't take the time of day or tag chips (yet).
- No records anywhere: notice "No time records found", and no modal.

## Which records

- Every note with `type: tijdsregistratie` in its frontmatter, so archived notes too, but not a template (`templateMatcher`).
- A record is a list item that opens with a time in inline code: `` - `14:05:12` Overleg met Jan ``. `hh:mm` and a single-digit hour are fine. A time in inline code closing the line is the record's explicit end: `` - `09:30:00` Overleg `09:49:33` ``. Tasks (`- [ ]`) and items with the time later on the line are no records.
- Each note is taken on its own. The last record of one note and the first of the next are never one day, and dates are only inferred within a note. Notes are listed by their latest date, those without any date last.

## Days

A day starts at:

- a level 2 heading, ideally `## [[20261104]]`;
- a heading of any level that names a date (`2026-11-04`, `4-11-2026`, `24 oktober 2026`, …; see `headingDate`);
- a `---` line, where a heading was left out (the frontmatter's `---` lines don't count).

Nothing else starts a day. Until 2026-11-22 a top-level record earlier than the one before it did too, to catch a heading that was left out; that rule is gone.

A day without a date in its heading gets one only when no other is possible: one such day between the 4th and the 6th was the 5th, headed "~ donderdag 5 november 2026". Any other says what it lies between ("vóór 24 oktober 2026", "tussen … en …", "datum onbekend") and has no weekday to search or filter on. Several in a row are numbered in the note's order: "(dag 2 van 2)".

## Order

Records are written in the order they happen, and so are days. The history relies on that and shows where it doesn't hold instead of working around it.

- **Within a day** every record, nested ones included, is at least as late as the one above it. Times are compared by the minute, so `11:05` after `11:05:30` is fine.
- **Past midnight**: a day may run past midnight once. A record earlier than the one above it is the next night when the day hasn't passed midnight yet and it is earlier than the day's first record. It belongs to the day it is written under, and its time counts on from midnight: 00:30 is 24:30 on the day's clock (`dayTimes` in `order.ts`). After that, times must stay earlier than the day's first record, which keeps a day under 24 hours.
- **Out of order** is any other step back in time, and a date heading no later than the date heading above it in the note (also when the same date appears twice). Each record or date is compared with the one right above it, out of order or not, so one misplaced line marks one break rather than everything after it.
- Known limit: a time typed too early, but still before the day's first record, is taken for passing midnight, and the records after it are then marked instead of that one. The notice still points at the spot.
- A forgotten day heading where the time goes forward can't be told from a long pause; one where the time goes back looks like a long day or a break in the order.

How a break shows:

- Opening the search gives a notice for 15 seconds: `Time records out of order in "<note>" at line <n>, and <k> more`. The line is the first break in the first note that has one; notes in the order above, lines top to bottom.
- The record's row gets a red `alert-triangle` where its durations would be, with an `aria-label` (tooltip) "Out of order: Earlier than the record above it in the note". A day heading gets the same mark: "Not later than the date above it in the note".
- A record out of order has no durations: no explicit end, no time to the next record, and the record above it has no time to it either. It adds nothing to a total.
- Undated days between two dates running backwards are headed "datum onbekend": nothing is inferred from those dates.

## Durations

- **Took**: by the explicit end, accent colour with a `timer` icon. An end earlier than the start ran past midnight.
- **Time to the next record**: to the next record of the same day in the note's order, worked out before any filtering, so a search that hides the next record doesn't change it. It runs on past midnight on the day's clock. Faint, with an `arrow-up` icon, as the list runs from the latest back. None for the last record of a day; none when the next time is a few seconds earlier (same minute, written without seconds).
- Shown as `45s`, `5m33s`, `1h5m33s`, `1h0m33s`, `2h`: to the second, zero parts at the end left out.

## The list

- The latest record first, in every note. At most 300 rows; typing narrows the list, so what falls off is what a search would have to name anyway.
- Each day's records are headed by its date (or what is known of it). The heading sticks to the top while its records scroll under it.
- A row: the time in inline code, shaded by its hour like the heatmap in the note, the text with each wikilink shown as its display text or target and each tag (`#werk`, `#werk/overleg`) as a tag pill in the theme's tag colours, and the durations at the right.
- Margins: the list has no side padding and rows and headings 6px, so text starts about 7px from the modal's edge (24px before). The chip rows line up with it. The text uses the condensed cut of the interface font where the font has one.
- Enter opens the note at the record's line, Mod+Enter in a new tab, Alt+Enter or Alt+click in a new tab in the background, leaving the search open.

## Searching and filtering

All filters combine: a record shows when it matches the query and every chip row.

- **Query**: every word must match, case-insensitive: anywhere in the record's text (link targets included), or at the start of its time, or of a word for its date: weekday and month in Dutch and English, day of the month, year, `20261024`, `2026-10-24`. One character only matches a whole word, so "4" is the 4th, not every year. "overleg maandag", "okt 2026 lunch". A tag is found as text too: "#werk".
- **First chip row**, Mod+digit:
  - weekdays `ma` … `zo` on Mod+1 to Mod+7. Several mean any of them. A day without a known date has no weekday and only shows with none of them on.
  - time of day `<12` and `≥12` on Mod+8 and Mod+9, dashed like the other time chips. By the record's time on the day's clock: before 12:00 or from 12:00 on, so a record past midnight on a long day is `≥12`. Both on is the same as neither.
- **Second chip row**, Alt+digit, only when tags are set: a chip per tag in **Settings → Tags to add to a time record** (`timeRecordTags`, the same tags the add modal offers; blanks and repeats left out), read when the search opens. Several mean any of them. A tag also finds the tags nested under it: `werk` finds `#werk/overleg`, but not `#werkplaats`. Case doesn't matter.
- The shortcuts are caught on the modal in the capture phase, so Obsidian's own Mod+digit bindings never see them.

## Total

- Shown only once something narrows the list (a query, or any chip on), at the right end of the last chip row: `2h54m33s · 3 records`. Over the whole history it says little.
- The sum over **every** record found, also past the 300 rows shown.
- Each record counts its explicit end where it has one, otherwise its time to the next record. So a total never runs across the end of a day, and a record out of order counts nothing.
- Only the records found count: filtering for `#werk` counts each `#werk` record's own time, up to the next record whatever that is.

## Code

In `src/timerecord/`:

- `recordline.ts`: reading a record line (time, start and end in seconds, text).
- `recordtags.ts`: `chipTags`, the chip tags from settings, shared with the add modal.
- `history/index.ts`: the command, `searchTimeRecords(app, settings, preset)`, the notice.
- `history/collect.ts`: `collectHistory` reads every note and returns the entries and the order issues (note and line).
- `history/parsedays.ts`: a note's text to its written days (date, line of the heading or `---`, records).
- `history/placedays.ts`: what is known of each day's date, and whether a written date is out of order.
- `history/order.ts`: `dayTimes`, a day's records on the day's clock, and which are out of order.
- `history/durations.ts`: took, the gap to the next record, formatting.
- `history/entries.ts`: the entries (day-clock time, out of order, tags, durations), `totalSeconds`, `readableText`, `textParts` (text and tags).
- `history/search.ts`: the query.
- `history/weekdayfilter.ts`, `history/daypartfilter.ts`, `history/tagfilter.ts`: the chips and what they let through. The weekday and time of day chips share one `FilterBar`; the modal picks each one's values out of it.
- `history/modal.ts`: the modal.
- `urihandler.ts`: the URI.
- Styles: "Time record history" in `styles.css`, classes `ronald-time-history-…`.

## Tests

`npm test`; each module above that has no Obsidian values has a `.test.ts` next to it. `order.test.ts` covers passing midnight, the 24-hour bound, passing it only once, nested records and the minute comparison; `entries.test.ts` the gap past midnight, durations around a record out of order, tags and the total; `placedays.test.ts` dates out of order; `daypartfilter.test.ts` and `tagfilter.test.ts` the new chips.

## Checking it in the TestVault

`VAULT_OBSIDIAN="$VAULT_TEST" ./to-vault.sh`. The TestVault's chip tags are `werk` and `thuis`. In `0-werkruimte`:

- `tijdsregistratie.md`: 7 November has tags and runs past midnight (00:20 belongs to it, 1h35m after 22:45).
- `tijdsregistratie-archief-2026-09.md`: 9 September runs past midnight; three breaks in the order: "Na kind eerder dan kind" (22 September), "Pauze" (23 September) and the heading of 12 September after 14 September. Opening the search names line 27 of that note, and 2 more.

Run the command with `obsidian vault=TestVault eval`, read the rows, the chips and `.ronald-time-history-total` from the DOM, toggle chips by dispatching `keydown` on the modal (`code: 'Digit1'` with `altKey` or `metaKey`), and look at `dev:errors`. Close each modal when done: one left open stays under the next and is what `querySelector` finds first.
