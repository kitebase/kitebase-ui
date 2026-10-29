/**
 * The host's login — when kitebase is the admin of an application that logs
 * people in itself (`client.login` in config.yaml).
 *
 * Then there is one login, the host's: the client takes its token from the
 * host's session through POST auth/token, sends people to the host's login
 * page when there is none, and leaves through the host's logout page.
 *
 * Pure: no Svelte, no browser globals, so the rules are tested on their own.
 */

/** The `client` section of /kitebase/info: where the client lives, who logs in. */
export interface ClientInfo {
  role: 'app' | 'admin';
  base: string;
  login: string | null;
  logout: string | null;
  /** The app's name (`title` in config.yaml), and what its own login page shows. */
  title?: string | null;
  signin?: { subtitle?: string; hint?: string };
}

/**
 * A page of the host. `origin` is the backend's address in dev, where the
 * client runs on Vite's port and a relative path would stay on Vite; it is ''
 * in a build, served by the host itself.
 */
export function hostPage(path: string, origin: string, next?: string): string {
  const url = `${origin}${path}`;
  if (next === undefined) return url;
  return `${url}${url.includes('?') ? '&' : '?'}next=${encodeURIComponent(next)}`;
}

/**
 * Where the host's login sends people back: the whole address in dev (the
 * client is on another origin), the path in a build, since a host rightly
 * refuses a `next` that points elsewhere.
 */
export function nextOf(
  location: { href: string; pathname: string; search: string; hash: string },
  origin: string
): string {
  return origin ? location.href : `${location.pathname}${location.search}${location.hash}`;
}

/**
 * The token the client starts with. With a host login the host's session
 * decides, whatever token is saved: a token from a session that has since
 * ended must not open the client. Without one, the saved token as before.
 */
export async function startToken(
  client: ClientInfo | null,
  deps: { hostToken: () => Promise<string | null>; savedToken: () => string | null }
): Promise<string | null> {
  if (client?.login) return deps.hostToken();
  return deps.savedToken();
}
