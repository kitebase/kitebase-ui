/**
 * Blueprint registry — id -> { component, defaults }.
 *
 * A blueprint carries BOTH its structure (the .svelte component) AND its
 * default composition, so `<Chrome blueprint="classic" />` works with zero
 * config. An app overrides only the areas it wants to change.
 *
 * Later: blueprint selection + composition overrides move to the server config.
 */
import type { Component } from 'svelte';
import type { Composition } from './types';
import ClassicBlueprint from './blueprints/ClassicBlueprint.svelte';

export interface BlueprintDef {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: Component<any>;
  defaults: Pick<Composition, 'areas'>;
}

const classic: BlueprintDef = {
  component: ClassicBlueprint,
  defaults: {
    areas: {
      // area1 = top strip (used here as the header)
      area1: {
        start: [{ component: 'logo' }, { component: 'title' }],
        end: [{ component: 'help' }, { component: 'current-user' }, { component: 'login-logout' }],
      },
      // area2 = left strip (used here as the sidebar)
      area2: [{ component: 'menu-tree', props: { rootId: 'main' } }],
      // area3 = main (the desktop work-area)
      area3: [{ component: 'work-area' }],
      // area4 = bottom strip (used here as the status bar)
      area4: {
        start: [{ component: 'current-date' }, { component: 'status-area' }],
      },
    },
  },
};

export const blueprints: Record<string, BlueprintDef> = { classic };
