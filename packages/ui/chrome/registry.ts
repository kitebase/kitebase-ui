/**
 * Chrome component registry — id -> Svelte component.
 *
 * Known to the client (static for now; grows over time, later contributable by
 * plugins). Two families: framework built-ins (below) and, in future,
 * plugin-contributed components merged in at startup.
 *
 * `menu-tree` reuses the existing MenuSidebar; a component is just an atom
 * (rendering + its own data source), placed into an area by the composition.
 */
import type { Component } from 'svelte';

import MenuSidebar from '$kitebase/components/MenuSidebar.svelte';
import Logo from './components/Logo.svelte';
import Title from './components/Title.svelte';
import CurrentUser from './components/CurrentUser.svelte';
import HelpButton from './components/HelpButton.svelte';
import LoginLogout from './components/LoginLogout.svelte';
import Clock from './components/Clock.svelte';
import CurrentDate from './components/CurrentDate.svelte';
import StatusArea from './components/StatusArea.svelte';
import WorkArea from './components/WorkArea.svelte';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const registry: Record<string, Component<any>> = {
  logo: Logo,
  title: Title,
  help: HelpButton,
  'current-user': CurrentUser,
  'login-logout': LoginLogout,
  clock: Clock,
  'current-date': CurrentDate,
  'status-area': StatusArea,
  'menu-tree': MenuSidebar,
  'work-area': WorkArea,
  // Declared but not yet implemented (slots stay empty if referenced):
  //   'menu-dropdown', 'quickbar', 'tenant-badge', 'notifications', 'communications'
};
