import tseslint from 'typescript-eslint';
import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores } from 'eslint/config';

/**
 * The feature folders in src/, and which other features each may import.
 * These are the dependency rules in AGENTS.md; a new feature folder is added
 * here too.
 */
const FEATURES: Record<string, string[]> = {
	tasks: ['navigation'],
	projects: [],
	links: [],
	navigation: [],
	editing: [],
	timerecord: [],
	naming: [],
};

const RULES_MESSAGE = 'See AGENTS.md → Dependency rules.';

/** An import of one of `folders` in src/, from anywhere below src/. */
const importOf = (folders: string[]) => `^(\\.\\./)+(${folders.join('|')})(/|$)`;

/** `no-restricted-imports` with the given patterns, for the files in `glob`. */
function restrict(glob: string, patterns: { regex: string; message: string }[]) {
	return {
		files: [glob],
		rules: { 'no-restricted-imports': ['error', { patterns }] },
	};
}

const dependencyRules = [
	// Shared code knows nothing of the features, the settings or the plugin.
	restrict('src/shared/**/*.ts', [
		{
			regex: importOf([...Object.keys(FEATURES), 'settings', 'main']),
			message: `shared/ must not import from a feature, settings/ or main.ts. ${RULES_MESSAGE}`,
		},
	]),
	// A feature imports shared/ and the features it is allowed; from settings/
	// only the section helpers, since its own settings live in the feature.
	...Object.entries(FEATURES).map(([feature, allowed]) => {
		const others = Object.keys(FEATURES).filter(
			(other) => other !== feature && !allowed.includes(other),
		);
		return restrict(`src/${feature}/**/*.ts`, [
			{
				regex: importOf(others),
				message: `${feature}/ must not import from ${others.join(', ')}. ${RULES_MESSAGE}`,
			},
			{
				regex: '^(\\.\\./)+settings(/(?!section$).*)?$',
				message: `Features import only settings/section from settings/. ${RULES_MESSAGE}`,
			},
		]);
	}),
	// The settings combine each feature's settings.ts and need nothing else.
	restrict('src/settings/**/*.ts', [
		{
			regex: `^\\.\\./(${Object.keys(FEATURES).join('|')})/(?!settings$)`,
			message: `settings/ imports only the features' settings.ts. ${RULES_MESSAGE}`,
		},
	]),
];

export default tseslint.config(
	globalIgnores([
		'node_modules',
		'dist',
		'esbuild.config.mjs',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	...dependencyRules,
);
