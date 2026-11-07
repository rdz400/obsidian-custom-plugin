/** The class every record's time gets, in the editor and in reading mode. */
const TIME_HEAT_CLASS = 'ronald-time-heat';

/**
 * The classes of a time in `hour`: the shared one and one for the hour,
 * "ronald-time-heat ronald-time-heat-08", which `styles.css` gives a colour.
 */
export function heatClasses(hour: number): string {
    return `${TIME_HEAT_CLASS} ${TIME_HEAT_CLASS}-${String(hour).padStart(2, '0')}`;
}
