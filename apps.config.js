/**
 * Backend app-instances a client can be bound to.
 *
 * Two orthogonal dimensions, one source each:
 *
 *   - the *app-instance* is a backend directory. Everything about it — plugin
 *     roots, API prefix, API port — is already declared in its `config.yaml`,
 *     so this file only has to say where that directory is.
 *   - the *client* owns its dev port and declares which app it is bound to,
 *     in its own `kitebase.config.js`.
 *
 * Adding an app costs one line here, or none when it sits at the conventional
 * path `apps/<name>` where real app-instances live.
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** This repository. */
const CLIENT = __dirname;

/** How far above this repository a workspace is looked for. */
const REACH = 3;

/**
 * The workspace directory that holds `relative`, looked for above this
 * repository.
 *
 * Which is not the same as counting levels: cloned from GitHub this repository
 * is `<workspace>/kitebase-ui`, and in the development workspace it is
 * `<workspace>/client` — one arrangement of the same siblings, and
 * neither is the right one to hard-code.
 *
 * @param {string} relative  path of an app-instance, relative to a workspace
 * @returns {string|null} the absolute app directory, when one was found
 */
function lookUp(relative) {
  let directory = CLIENT;
  for (let level = 0; level < REACH; level++) {
    directory = dirname(directory);
    const candidate = resolve(directory, relative);
    if (existsSync(resolve(candidate, 'config.yaml'))) return candidate;
  }
  return null;
}

/**
 * App-instances this repository knows by name, each with the places it can be:
 * the library checkout is `server/` in the development workspace and
 * `kitebase/` when cloned from GitHub. Only devtest is here: it ships inside
 * that checkout, which whoever works on the library has anyway, and
 * `apps/playground` is a client bound to it. Anything else is found by the
 * convention `apps/<name>`, or says where it is with KITEBASE_APP_ROOT
 * — which is how an app in a repository of its own is reached, the commons
 * demo included.
 * @type {Record<string, string[]>}
 */
const APP_ROOTS = {
  devtest: ['server/devtest', 'kitebase/devtest']
};

/**
 * What a client needs to know about the app-instance it is bound to.
 *
 * @typedef {object} ResolvedApp
 * @property {string} app             app-instance name
 * @property {string} appRoot         absolute directory holding its config.yaml
 * @property {string[]} pluginRoots   absolute plugin roots, in declaration order
 * @property {(string[] | null)[]} pluginSelection  per root, the plugin directories
 *                                    it contributes, or null for the whole root
 * @property {string[][]} pluginSkip   per whole root, the directories of partial
 *                                    roots nested in it, which it leaves out
 * @property {number} devPort         port of the client's dev server
 * @property {string} apiPrefix       API route prefix
 * @property {string} endpointPrefix  dispatcher prefix
 * @property {string} apiBase         backend base URL, the target of the dev proxy
 * @property {string} clientBase      where the client is mounted: '' for the root, or '/admin'
 */

/**
 * Absolute directory of an app-instance — the one holding its `config.yaml`.
 *
 * Apps of this repository are found by the table above, or by the convention
 * `apps/<name>`. An app that lives anywhere else says where it is,
 * with KITEBASE_APP_ROOT — which is what keeps a symlink into `apps/`
 * a convenience for editing both at once, rather than the only way to build.
 *
 * @param {string} app
 */
export function appRoot(app) {
  const given = process.env.KITEBASE_APP_ROOT;
  if (given) return resolve(given);

  const candidates = APP_ROOTS[app] ?? [`apps/${app}`];
  for (const relative of candidates) {
    const found = lookUp(relative);
    if (found) return found;
  }
  // Not found: name the nearest place it would have been, which is the one
  // worth naming in the error that follows.
  return resolve(CLIENT, '..', candidates[0]);
}

/**
 * True when `child` is nested inside `parent`.
 * @param {string} child
 * @param {string} parent
 */
function isInside(child, parent) {
  const rel = relative(parent, child);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/**
 * The plugins of each root that a partial root contributes: what its `include`
 * names, plus what those depend on, followed over every root. The backend does
 * the same (PluginsManager._select) and is the one that reports what is wrong
 * (an unknown name, an ambiguous dependency, a missing root): here a doubt
 * widens the selection rather than failing a vite config.
 *
 * @param {{ root: string, include: string[] | null }[]} entries
 * @returns {Map<string, string[]>} root → plugin directory names, in selection order
 */
function selectPlugins(entries) {
  /** @type {Map<string, { root: string, dir: string, depends: string[] }[]>} */
  const found = new Map();
  /** @type {string[]} */
  const pending = [];
  /** @type {Set<string>} */
  const chosen = new Set();
  for (const { root, include } of entries) {
    for (const plugin of scanRoot(root)) {
      if (!found.has(plugin.name)) found.set(plugin.name, []);
      found.get(plugin.name)?.push(plugin);
      if (include === null || include.includes(plugin.name)) {
        chosen.add(`${root}\0${plugin.name}`);
        pending.push(plugin.name);
      }
    }
  }

  /** @type {Map<string, string[]>} */
  const selected = new Map();
  /** @type {Set<string>} */
  const seen = new Set();
  while (pending.length) {
    const name = /** @type {string} */ (pending.shift());
    if (seen.has(name)) continue;
    seen.add(name);
    const matches = found.get(name) ?? [];
    // Asked for in a root: that one. Reached as a dependency: every root that
    // provides it, which the backend refuses when it is more than one.
    const asked = matches.filter((p) => chosen.has(`${p.root}\0${name}`));
    for (const plugin of asked.length ? asked : matches) {
      if (!selected.has(plugin.root)) selected.set(plugin.root, []);
      selected.get(plugin.root)?.push(plugin.dir);
      pending.push(...plugin.depends);
    }
  }
  return selected;
}

/**
 * The plugins directly inside a root: a directory with a config.yaml, named
 * by its `name:` or by the directory. A root that does not exist holds none.
 *
 * @param {string} root
 */
function scanRoot(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(resolve(root, d.name, 'config.yaml')))
    .map((d) => {
      const config = parse(readFileSync(resolve(root, d.name, 'config.yaml'), 'utf8')) ?? {};
      return {
        root,
        dir: d.name,
        name: String(config.name ?? d.name),
        depends: Array.isArray(config.depends_on) ? config.depends_on.map(String) : []
      };
    });
}

/**
 * Resolve the binding of a client to an app-instance.
 *
 * @param {object} client
 * @param {string} client.app          app-instance this client is bound to
 * @param {number} client.devPort      port of this client's dev server
 * @param {boolean} [client.overridable]  honour KITEBASE_APP (only the generic shell does)
 * @returns {ResolvedApp}
 */
export function resolveApp({ app, devPort, overridable = false }) {
  const requested = process.env.KITEBASE_APP;
  const givenRoot = process.env.KITEBASE_APP_ROOT;

  if ((requested && requested !== app) || givenRoot) {
    if (!overridable) {
      throw new Error(
        `KITEBASE_APP${givenRoot ? '_ROOT' : ''} is set but this client is bound to ` +
          `'${app}'. Custom clients target one backend; use apps/shell to switch ` +
          `app-instance.`
      );
    }
    // An out-of-repo app has no entry in the table: its name is the one its
    // own config.yaml declares, read below.
    app = requested ?? app;
  }

  const root = appRoot(app);
  const configPath = resolve(root, 'config.yaml');
  if (!existsSync(configPath)) {
    throw new Error(
      `App-instance '${app}': no config.yaml at ${configPath}\n` +
        `This client is bound to '${app}', which lives in the kitebase checkout ` +
        `beside this one — looked for up to ${REACH} levels above this ` +
        `repository. To point the shell at an application of your own:\n` +
        `  KITEBASE_APP_ROOT=/path/to/app pnpm --filter shell dev\n` +
        `or, from that application's directory: kitebase dev`
    );
  }
  const config = parse(readFileSync(configPath, 'utf8')) ?? {};
  const api = config.api ?? {};
  if (givenRoot) app = config.name ?? app;

  // Plugin roots come from the same `plugins:` list the backend composes from,
  // so a root added there is seen by the client without a second edit. An entry
  // is a path, or the mapping the backend also accepts — `{ path, include }`,
  // which is how a shared root is taken in part.
  /** @type {{ root: string, include: string[] | null }[]} */
  const entries = [];
  for (const entry of config.plugins ?? ['plugins']) {
    const given = typeof entry === 'string' ? entry : entry?.path;
    if (typeof given !== 'string') {
      throw new Error(
        `${configPath}: a plugin root is a path, or a mapping with one — ` +
          `got ${JSON.stringify(entry)}`
      );
    }
    const path = resolve(root, given);
    if (entries.some((e) => e.root === path)) continue;
    const include = typeof entry === 'string' ? null : (entry.include ?? null);
    entries.push({ root: path, include });
  }

  const selected = selectPlugins(entries);

  // A whole root nested inside a whole root is dropped: the outer glob already
  // covers it, and the duplicate would only produce components discovered
  // twice. A partial one is kept, and the outer glob leaves its directory out:
  // that is how SAD reaches the commons, through a link inside its own root.
  const isWholeIn = (/** @type {string} */ r) =>
    entries.some((other) => other.include === null && isInside(r, other.root));
  const kept = entries.filter((e) => e.include !== null || !isWholeIn(e.root));
  const pluginRoots = kept.map((e) => e.root);
  const pluginSelection = kept.map((e) => (e.include === null ? null : selected.get(e.root) ?? []));
  const pluginSkip = kept.map((e) =>
    e.include === null
      ? kept.filter((n) => n.include !== null && isInside(n.root, e.root)).map((n) => relative(e.root, n.root))
      : []
  );

  return {
    app,
    appRoot: root,
    pluginRoots,
    pluginSelection,
    pluginSkip,
    devPort,
    apiPrefix: api.prefix ?? 'kitebase',
    endpointPrefix: api.endpoint_prefix ?? 'endpoint',
    apiBase: `http://localhost:${api.port ?? 8300}`,
    clientBase: clientBase(config.client, configPath)
  };
}

/**
 * Where the client is mounted, from the `client:` section of config.yaml.
 *
 * The same rule as kitebase.webclient on the server, which mounts what this
 * builds: `role: app` (the default) is the root, `role: admin` is /admin, and
 * `base` moves either. SvelteKit wants '' or '/path' with no trailing slash.
 *
 * @param {{ role?: string, base?: string } | undefined} section
 * @param {string} configPath  for the error message
 * @returns {string}
 */
export function clientBase(section, configPath) {
  const role = section?.role ?? 'app';
  if (role !== 'app' && role !== 'admin') {
    throw new Error(`${configPath}: client.role '${role}' is not one of app, admin`);
  }
  const given = section?.base ?? (role === 'admin' ? '/admin' : '');
  const base = given === '/' ? '' : String(given ?? '').replace(/\/+$/, '');
  if (base && !base.startsWith('/')) {
    throw new Error(`${configPath}: client.base '${given}' must start with '/'`);
  }
  return base;
}
