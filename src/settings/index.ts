import { DEFAULT_LINK_SETTINGS, type LinkSettings } from '../links/settings';
import { DEFAULT_NAVIGATION_SETTINGS, type NavigationSettings } from '../navigation/settings';
import { DEFAULT_PROJECT_SETTINGS, type ProjectSettings } from '../projects/settings';
import { DEFAULT_TASK_SETTINGS, type TaskSettings } from '../tasks/settings';
import {
    DEFAULT_TIME_RECORD_SETTINGS,
    type TimeRecordSettings,
} from '../timerecord/settings';

export { RonaldSettingTab } from './tab';

/** The plugin's settings: each feature's own, stored together in one file. */
export type RonaldSettings = TaskSettings &
    ProjectSettings &
    LinkSettings &
    NavigationSettings &
    TimeRecordSettings;

export const DEFAULT_SETTINGS: RonaldSettings = {
    ...DEFAULT_TASK_SETTINGS,
    ...DEFAULT_PROJECT_SETTINGS,
    ...DEFAULT_LINK_SETTINGS,
    ...DEFAULT_NAVIGATION_SETTINGS,
    ...DEFAULT_TIME_RECORD_SETTINGS,
};
