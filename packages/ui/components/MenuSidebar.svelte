<script lang="ts">
  /**
   * MenuSidebar.svelte — sidebar-tree consuming `get_menu` (kitebase PLUGIN_MODEL.md §9.6).
   *
   * Renders the composed, filtered, ordered tree for one menu root and, on leaf
   * click, opens the target page via PanelPage. Sidebar clicks are a change of
   * work (UI_ARCHITECTURE §3.1) — clear the stack rather than pushing on top of
   * whatever was open before.
   */
  import { api } from '$kitebase/api/client';
  import { errorText } from '$kitebase/api/envelope';
  import { getContext } from 'svelte';
  import { stack as globalStack, type StackInstance } from '$kitebase/stack/stack.svelte';
  import PanelPage from './PanelPage.svelte';
  import { resolveIcon } from './icons';
  import { msgbox } from './msgbox.svelte';
  import { applyResult } from './resultAction';
  import { home } from '../chrome/home.svelte';

  interface MenuNode {
    id: string;
    label: string;
    icon?: string;
    action?: string;
    panel?: string;
    /** action: endpoint — the operation, its arguments, and what to ask first */
    op?: string;
    params?: Record<string, unknown>;
    confirm?: string;
    children?: MenuNode[];
    [key: string]: unknown;
  }

  interface Props {
    rootId?: string;
  }

  let { rootId = 'main' }: Props = $props();

  const stack = getContext<StackInstance>('kb:stack') ?? globalStack;

  let items = $state<MenuNode[]>([]);
  let error = $state<string | null>(null);
  let activeId = $state<string | null>(null);
  let expanded = $state<Set<string>>(new Set());
  /** The item whose operation is running: it must not be clicked twice. */
  let running = $state<string | null>(null);

  function collectGroupIds(nodes: MenuNode[]): string[] {
    const ids: string[] = [];
    for (const node of nodes) {
      if (node.children?.length) {
        ids.push(node.id, ...collectGroupIds(node.children));
      }
    }
    return ids;
  }

  async function load(id: string) {
    error = null;
    try {
      const res = await api.endpoint('get_menu', { id });
      if (res.status === 'success') {
        const data = res.data as { items?: MenuNode[]; home_page?: string };
        items = data.items ?? [];
        home.page = data.home_page ?? null;
        expanded = new Set(collectGroupIds(items));
      } else {
        error = errorText(res, 'Unknown error');
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  function toggle(id: string) {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expanded = next;
  }

  async function open(node: MenuNode) {
    if (node.action === 'endpoint') return runEndpoint(node);
    if (node.action !== 'stack_push' || !node.panel) return;
    activeId = node.id;
    stack.clear();
    stack.push(PanelPage, { panelId: node.panel });
  }

  /**
   * `action: endpoint` — a menu item that DOES something instead of opening a
   * page (kitebase PLUGIN_MODEL.md §9.4). The client stays generic: it knows how to ask, how to
   * confirm and what to do with an answer, and nothing about what the operation
   * means. `confirm` is a yes/no question and only that — an operation that
   * needs a *value* is a page, not a menu item that fires. What the answer
   * turns into is `applyResult`, shared with every other place a command runs.
   */
  async function runEndpoint(node: MenuNode) {
    const confirmText = typeof node.confirm === 'string' ? node.confirm : null;
    if (confirmText && !(await msgbox.confirm(confirmText, node.label))) return;

    running = node.id;
    try {
      const res = await api.endpoint(node.op as string, (node.params ?? {}) as Record<string, unknown>);
      await applyResult(res, { title: node.label, stack });
    } catch (e) {
      await msgbox.error(e instanceof Error ? e.message : String(e), undefined, node.label);
    } finally {
      running = null;
    }
  }

  // Back home (the logo, the title) nothing in the menu is open any more.
  $effect(() => stack.subscribe((pages) => { if (pages.length === 0) activeId = null; }));

  // Keyed on what it fetches: an effect re-runs whenever anything it read
  // changes, which with spread props includes "the parent re-rendered". Here a
  // spurious run would re-expand every group the user had collapsed, undoing a
  // gesture with no visible cause.
  let loadedRoot: string | null = null;
  $effect(() => {
    if (rootId === loadedRoot) return;
    loadedRoot = rootId;
    load(rootId);
  });
</script>

<nav class="px-2 pb-4 text-sm">
  {#if error}
    <div class="px-2 py-1 text-xs text-red-600">{error}</div>
  {/if}

  {#snippet renderNodes(nodes: MenuNode[], depth: number)}
    {#each nodes as node (node.id)}
      {@const Icon = resolveIcon(node.icon)}
      {@const isGroup = !!node.children?.length}
      <div>
        <button
          type="button"
          class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-gray-700 hover:bg-gray-100"
          class:bg-gray-100={activeId === node.id}
          class:font-medium={isGroup}
          class:opacity-60={running === node.id}
          style="padding-left: {8 + depth * 14}px"
          disabled={running === node.id}
          onclick={() => (isGroup ? toggle(node.id) : open(node))}
        >
          {#if Icon}
            <Icon size={15} class="shrink-0 text-gray-500" />
          {/if}
          <span class="truncate">{node.label}</span>
        </button>
        {#if isGroup && expanded.has(node.id)}
          {@render renderNodes(node.children ?? [], depth + 1)}
        {/if}
      </div>
    {/each}
  {/snippet}

  {@render renderNodes(items, 0)}
</nav>
