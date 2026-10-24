import { DEFAULT_LINK_SETTINGS, type LinkSettings } from '../links/settings';
import { DEFAULT_NAVIGATION_SETTINGS, type NavigationSettings } from '../navigation/settings';
import { DEFAULT_TASK_SETTINGS, type TaskSettings } from '../tasks/settings';

export { RonaldSettingTab } from './tab';

/** The plugin's settings: each feature's own, stored together in one file. */
export type RonaldSettings = TaskSettings & LinkSettings & NavigationSettings;

export const DEFAULT_SETTINGS: RonaldSettings = {
    ...DEFAULT_TASK_SETTINGS,
    ...DEFAULT_LINK_SETTINGS,
    ...DEFAULT_NAVIGATION_SETTINGS,
};
