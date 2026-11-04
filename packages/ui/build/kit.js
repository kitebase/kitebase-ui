/**
 * Shared SvelteKit configuration for every Kitebase client: the options of the
 * sveltekit() Vite plugin, which vite.js passes to it.
 *
 * SPA mode (static adapter, fallback to index.html) and the aliases:
 *   $kitebase      this library, consumed from source
 *   $app-plugins  the client's own registry and formatters
 *   $plugins0…N   the backend plugin roots, in the order config.yaml declares
 *                 them; the globs over them are emitted by plugin-globs.js
 *
 * There is deliberately no plain `$plugins`: with several roots it would have
 * to pick one, and which one is "the app's own" is not something to guess.
 */
import adapter from '@sveltejs/adapter-static';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UI_ROOT = resolve(__dirname, '..');

/** @param {import('../../../apps.config.js').ResolvedApp} app  from resolveApp() */
export function kitebaseKit(app) {
  /** @type {Record<string, string>} */
  const alias = {
    $kitebase: UI_ROOT,
    '$app-plugins': resolve('src/app-plugins')
  };
  app.pluginRoots.forEach((root, i) => {
    alias[`$plugins${i}`] = root;
  });

  return {
    adapter: adapter({
      fallback: 'index.html' // SPA mode: unknown routes → index.html
    }),
    // Where the server mounts it (client: in config.yaml): the dev server
    // uses the same path, so a link that works in one works in the other.
    paths: { base: app.clientBase ?? '' },
    // Deprecated in SvelteKit 3 in favour of package.json subpath imports,
    // which are static: these depend on the app's config.yaml.
    alias
  };
}
