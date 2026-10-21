/**
 * Resolving the binding of a client to an app-instance.
 *
 * What is worth a test here is the reading of `plugins:`, because that list is
 * written for the backend and the client only follows it: a form the backend
 * accepts and the client does not fails late, in a vite config, as a TypeError
 * with no application in it.
 */
import { describe, expect, it, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';
import { resolveApp } from './apps.config.js';

/** An app-instance holding the given `plugins:` list, reached as an outside app. */
function anApp(pluginsYaml) {
  const root = mkdtempSync(resolve(tmpdir(), 'kitebase-app-'));
  writeFileSync(resolve(root, 'config.yaml'), `name: sample\n${pluginsYaml}`);
  process.env.KITEBASE_APP_ROOT = root;
  return root;
}

/** A plugin directory under `root`, with the given config.yaml body. */
function aPlugin(root, dir, configYaml = '') {
  mkdirSync(resolve(root, dir), { recursive: true });
  writeFileSync(resolve(root, dir, 'config.yaml'), configYaml);
}

const resolved = () => resolveApp({ app: 'sample', devPort: 5174, overridable: true });

afterEach(() => {
  delete process.env.KITEBASE_APP_ROOT;
});

describe('the plugin roots', () => {
  it('are the paths the list names', () => {
    const root = anApp('plugins: [plugins]\n');
    expect(resolved().pluginRoots).toEqual([resolve(root, 'plugins')]);
  });

  it('also read the mapping form, which is how a shared root is taken in part', () => {
    const root = anApp('plugins:\n  - path: ../commons/plugins\n    include: [common]\n  - plugins\n');
    expect(resolved().pluginRoots).toEqual([
      resolve(root, '../commons/plugins'),
      resolve(root, 'plugins')
    ]);
  });

  it('say which entry they cannot read', () => {
    anApp('plugins:\n  - include: [common]\n');
    expect(() => resolved()).toThrow(/a plugin root is a path/);
  });
});

describe('the plugins a root contributes', () => {
  it('are all of them for a bare path', () => {
    const root = anApp('plugins: [plugins]\n');
    aPlugin(resolve(root, 'plugins'), 'shop');
    expect(resolved().pluginSelection).toEqual([null]);
  });

  it('are what include names, and what that depends on, over every root', () => {
    const root = anApp(
      'plugins:\n  - path: shared\n    include: [users]\n  - plugins\n'
    );
    aPlugin(resolve(root, 'shared'), 'common');
    aPlugin(resolve(root, 'shared'), 'users', 'depends_on: [common]\n');
    aPlugin(resolve(root, 'shared'), 'partners', 'depends_on: [common]\n');
    aPlugin(resolve(root, 'shared'), 'reports');
    aPlugin(resolve(root, 'plugins'), 'shop', 'depends_on: [reports]\n');
    const selection = resolved().pluginSelection;
    expect(selection[1]).toBeNull();
    expect([...selection[0]].sort()).toEqual(['common', 'reports', 'users']);
  });

  it('are found by the plugin name, even when the directory says otherwise', () => {
    const root = anApp('plugins:\n  - path: shared\n    include: [users]\n');
    aPlugin(resolve(root, 'shared'), 'users-v2', 'name: users\n');
    expect(resolved().pluginSelection).toEqual([['users-v2']]);
  });

  it('stay partial for a root nested in a whole one, which leaves it out', () => {
    const root = anApp('plugins:\n  - path: plugins/commons\n    include: [common]\n  - plugins\n');
    aPlugin(resolve(root, 'plugins/commons'), 'common');
    aPlugin(resolve(root, 'plugins/commons'), 'partners');
    aPlugin(resolve(root, 'plugins'), 'shop');
    const app = resolved();
    expect(app.pluginRoots).toEqual([resolve(root, 'plugins/commons'), resolve(root, 'plugins')]);
    expect(app.pluginSelection).toEqual([['common'], null]);
    expect(app.pluginSkip).toEqual([[], ['commons']]);
  });

  it('are none for a root that is not there, which the backend reports', () => {
    anApp('plugins:\n  - path: ../nowhere\n    include: [common]\n');
    expect(resolved().pluginSelection).toEqual([[]]);
  });
});

describe('where the client is mounted', () => {
  it('is the root when kitebase is the application', () => {
    anApp('plugins: [plugins]\n');
    expect(resolved().clientBase).toBe('');
  });

  it('is /admin when kitebase is the admin of a host', () => {
    anApp('client:\n  role: admin\n');
    expect(resolved().clientBase).toBe('/admin');
  });

  it('follows base, without the trailing slash SvelteKit refuses', () => {
    anApp('client:\n  role: admin\n  base: /backoffice/\n');
    expect(resolved().clientBase).toBe('/backoffice');
  });

  it('refuses what the server would refuse', () => {
    anApp('client:\n  role: backoffice\n');
    expect(() => resolved()).toThrow(/client.role 'backoffice'/);
    anApp('client:\n  base: admin\n');
    expect(() => resolved()).toThrow(/must start with '\/'/);
  });
});
