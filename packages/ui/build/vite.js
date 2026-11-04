/**
 * Shared Vite configuration for every Kitebase client.
 *
 * A client's own vite.config.ts is a two-line wrapper around this: what differs
 * between clients is the app binding, and that is already in kitebase.config.js.
 * The SvelteKit options (kit.js) go to the sveltekit() plugin.
 */
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { loadEnv } from 'vite';
import { kitebaseKit } from './kit.js';
import { kitebasePluginGlobs } from './plugin-globs.js';

/**
 * @param {import('../../../apps.config.js').ResolvedApp} app  from resolveApp()
 * @returns {import('vite').UserConfigFnObject}  pass to defineConfig()
 */
export function kitebaseVite(app) {
  return ({ mode, command }) => {
    // Two layers: `.env.<mode>` holds what is shared (development/production),
    // `.env.<app>` what belongs to one app-instance and wins. Both are optional
    // — they exist to override the values derived from the backend config.yaml.
    const env = {
      ...loadEnv(mode, process.cwd(), ''),
      ...loadEnv(app.app, process.cwd(), '')
    };

    // One origin in every form. A production build is served by the backend
    // itself; in dev the calls go to the Vite server, whose proxy below hands
    // them to the backend — so the browser never sees two origins and no
    // server needs CORS. VITE_API_BASE_URL is for the one setup that does
    // (client and backend on different machines), and then CORS is its price.
    const apiBase = env.VITE_API_BASE_URL ?? '';
    const apiPrefix = env.VITE_API_PREFIX ?? app.apiPrefix;
    const endpointPrefix = env.VITE_API_ENDPOINT_PREFIX ?? app.endpointPrefix;

    // The client reads these at runtime (packages/ui/config.ts). Putting
    // them in process.env is what makes them reach import.meta.env in dev as
    // well as in a build, so a fresh clone talks to the right backend with no
    // local setup. Values already read above, so a .env file still wins.
    process.env.VITE_API_BASE_URL = apiBase;
    process.env.VITE_API_PREFIX = apiPrefix;
    process.env.VITE_API_ENDPOINT_PREFIX = endpointPrefix;
    // The host's login and logout pages are not under the API prefix, so the
    // proxy does not reach them: in dev the client links them on the
    // backend's own address. A build is served by the host, and links them
    // relative. The host's cookie is the same on both ports of localhost.
    process.env.VITE_HOST_ORIGIN = command === 'serve' ? app.apiBase : '';

    return {
      plugins: [tailwindcss(), sveltekit(kitebaseKit(app)), kitebasePluginGlobs(app)],

      server: {
        port: env.VITE_DEV_PORT ? parseInt(env.VITE_DEV_PORT) : app.devPort,
        fs: {
          // Dev-server only. The workspace root (packages/ui + apps) plus
          // every backend plugin root: full-stack plugin .svelte live outside the client.
          allow: ['../..', ...app.pluginRoots]
        },
        // The API, on the port the backend's config.yaml declares.
        proxy: {
          [`/${apiPrefix}`]: {
            target: app.apiBase,
            changeOrigin: true
          }
        }
      }
    };
  };
}
