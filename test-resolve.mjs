/**
 * Lets `node --test` run the TypeScript sources as they are: Node strips the
 * types itself, but doesn't resolve the extensionless imports the bundler
 * accepts ('../shared/markdown'), so a relative import that isn't found is
 * tried again with `.ts`.
 *
 * Used by `npm test`: node --import ./test-resolve.mjs --test …
 */
import { registerHooks } from 'node:module';

registerHooks({
    resolve(specifier, context, nextResolve) {
        try {
            return nextResolve(specifier, context);
        } catch (error) {
            const relative = specifier.startsWith('./') || specifier.startsWith('../');
            if (!relative || /\.[cm]?[jt]s$/.test(specifier)) throw error;
            return nextResolve(`${specifier}.ts`, context);
        }
    },
});
