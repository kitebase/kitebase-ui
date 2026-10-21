/**
 * Vite plugin serving `virtual:kitebase/plugins`.
 *
 * Plugin components and formatters live next to their Python/YAML counterparts,
 * under one or more backend plugin roots. `import.meta.glob` only accepts
 * literal patterns, so the globs cannot be built from a runtime list — this
 * module emits them instead, one per root, behind a virtual module:
 *
 *   import { pluginGlobs, formatterGlobs } from 'virtual:kitebase/plugins';
 *
 * The roots are exposed to the patterns as the aliases $plugins0…$pluginsN,
 * declared by the Kit config from the same resolved app (see kit.js). A root
 * taken in part (`include:`) is globbed only under the plugins selected from it,
 * so what the backend leaves out does not reach the client either: a
 * formatters.ts of an excluded plugin would otherwise run. A whole root leaves
 * out the partial roots nested in it, which have globs of their own.
 */
const VIRTUAL_ID = 'virtual:kitebase/plugins';
const RESOLVED_ID = '\0' + VIRTUAL_ID;

/** @param {import('../../../apps.config.js').ResolvedApp} app */
export function kitebasePluginGlobs(app) {
  /** @param {string} pattern @param {string} [options] */
  const globs = (pattern, options = '') =>
    app.pluginRoots
      .map((_, i) => {
        const dirs = app.pluginSelection[i];
        if (dirs === null) {
          const skip = app.pluginSkip[i].map((d) => `, '!$plugins${i}/${d}/**'`).join('');
          return `import.meta.glob(['$plugins${i}/${pattern}'${skip}]${options})`;
        }
        if (!dirs.length) return '{}';
        const patterns = dirs.map((d) => `'$plugins${i}/${d}/${pattern}'`).join(', ');
        return `import.meta.glob([${patterns}]${options})`;
      })
      .join(',\n  ');

  return {
    name: 'kitebase:plugin-globs',

    /** @param {string} id */
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
    },

    /** @param {string} id */
    load(id) {
      if (id !== RESOLVED_ID) return;
      // Object.assign and not a spread: a root nested in another is already
      // dropped upstream, so what collides here is two plugins of the same
      // name in different roots — last root wins, and the loader warns.
      return [
        `export const pluginGlobs = Object.assign({},`,
        `  ${globs('**/*.svelte')}`,
        `);`,
        `export const formatterGlobs = Object.assign({},`,
        `  ${globs('**/formatters.ts', ', { eager: true }')}`,
        `);`
      ].join('\n');
    }
  };
}
