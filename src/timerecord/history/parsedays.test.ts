import assert from 'node:assert/strict';
import { test } from 'node:test';

import { calendarDay } from './calendar';
import { parseDays } from './parsedays';

/** The records of each day, by their text. */
const textsPerDay = (note: string) =>
    parseDays(note).map((day) => day.records.map((record) => record.text));

test('a heading with a date starts a dated day', () => {
    const days = parseDays('## [[20261104]]\n\n- `08:00:00` a\n\n## [[20261105]]\n- `09:00:00` b\n');
    assert.deepEqual(days.map((day) => day.date), [calendarDay(2026, 11, 4), calendarDay(2026, 11, 5)]);
    assert.deepEqual(days.map((day) => day.records.length), [1, 1]);
});

test('records keep the line they are on', () => {
    const [day] = parseDays('## [[20261104]]\n\n- `08:00:00` a\n- `09:00:00` b\n');
    assert.deepEqual(day!.records.map((record) => record.line), [2, 3]);
});

test('the frontmatter is not a split, and its lines are still counted', () => {
    const days = parseDays('---\ntype: tijdsregistratie\n---\n\n- `08:00:00` a\n');
    assert.equal(days.length, 1);
    assert.equal(days[0]!.records[0]!.line, 4);
});

test('a --- line splits days', () => {
    assert.deepEqual(textsPerDay('- `08:00:00` a\n\n---\n\n- `21:00:00` b\n'), [['a'], ['b']]);
});

test('a record earlier than the one before it starts a new day', () => {
    assert.deepEqual(
        textsPerDay('## [[20261104]]\n- `08:00:00` a\n- `22:00:00` b\n- `07:00:00` c\n- `09:00:00` d\n'),
        [['a', 'b'], ['c', 'd']],
    );
});

test('nested records running past the next top-level record do not split the day', () => {
    const note = [
        '## [[20261107]]',
        '- `08:47:23` Wasmachine starten',
        '- `08:51:20` Klaar met wasmachine draaien',
        '- `08:59:50` pwsh geinstalleerd',
        '    - `09:19:12` gelezen basic pwshs',
        '    - `09:34:42` klaar lezen "Discovering Objects"',
        '    - `09:55:24` start one-liners and the pipeline `10:24:11`',
        '    - `10:30:10` anki start `10:35:48`',
        '    - `10:52:22` starten met "about_Parsing" (ook beetje over for/foreach gelezen) `11:17:58`',
        '- `09:40:40` Pauze',
        '- `09:41:33` Ui snijden',
    ].join('\n');

    const days = parseDays(note);
    assert.equal(days.length, 1);
    assert.equal(days[0]!.date, calendarDay(2026, 11, 7));
    assert.equal(days[0]!.records.length, 10);
    assert.deepEqual(days[0]!.records.slice(-2).map((record) => record.text), ['Pauze', 'Ui snijden']);
});

test('a nested record earlier than the one above it does not split the day', () => {
    assert.deepEqual(textsPerDay('- `10:00:00` a\n    - `09:50:00` b\n- `11:00:00` c\n'), [['a', 'b', 'c']]);
});

test('a forgotten split after a nested record is still found', () => {
    assert.deepEqual(
        textsPerDay('- `22:00:00` a\n    - `23:00:00` b\n- `07:00:00` c\n'),
        [['a', 'b'], ['c']],
    );
});

test('the clock is compared by the minute, for times without seconds', () => {
    assert.deepEqual(textsPerDay('- `11:05:30` a\n- `11:05` b\n'), [['a', 'b']]);
});

test('an undated stretch without records is no day', () => {
    assert.deepEqual(
        textsPerDay('---\n\n---\n\n- `08:00:00` a\n\n---\n\n## [[20261104]]\n- `09:00:00` b\n'),
        [['a'], ['b']],
    );
});

test('a dated heading without records still counts, to place the days around it', () => {
    const days = parseDays('## [[20261104]]\n\n## [[20261105]]\n- `09:00:00` b\n');
    assert.deepEqual(days.map((day) => day.records.length), [0, 1]);
});

test('a level 2 heading without a date splits, a smaller heading does not', () => {
    assert.deepEqual(textsPerDay('- `08:00:00` a\n## Vakantie\n- `09:00:00` b\n'), [['a'], ['b']]);
    assert.deepEqual(textsPerDay('- `08:00:00` a\n### Ochtend\n- `09:00:00` b\n'), [['a', 'b']]);
});

test('a smaller heading that names a date does split', () => {
    const days = parseDays('- `08:00:00` a\n### 2026-11-04\n- `09:00:00` b\n');
    assert.deepEqual(days.map((day) => day.date), [null, calendarDay(2026, 11, 4)]);
});

test('other lines are no records', () => {
    assert.deepEqual(textsPerDay('- Overleg om `09:30:00`\n- [ ] `09:30:00` taak\nTekst\n'), []);
});
