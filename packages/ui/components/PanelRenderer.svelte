<script lang="ts">
  /**
   * PanelRenderer.svelte — panel layout: header + recursive SplitPane nesting
   *
   * Renders a resolved page descriptor (from get_page) as:
   *   [optional header]  ← panel.title
   *   [content + splits] ← recursive SplitPane tree
   *
   * Split nesting algorithm (docs/UI_DESCRIPTORS.md §7):
   *   panels[0] is the INNERMOST split (wraps content directly).
   *   panels[-1] is the OUTERMOST split (wraps everything).
   *
   *   panels: [right, bottom]  →  bottom spans full width
   *   panels: [bottom, right]  →  right spans full height
   *
   * Implementation: process areas from END → outermost SplitPane rendered first.
   * Recursive Svelte 5 snippet handles arbitrary depth (0..N panels).
   *
   * Trigger system: event bus between areas.
   *   - Each area can emit events via onEvent(name, payload)
   *   - Split areas declare listeners via trigger: {on, from?, pass?}
   *   - handleAreaEvent routes events → updates triggerMap[areaId]
   *   - triggerMap[areaId] is passed as `trigger` prop to the receiving ViewRenderer
   *
   * pass variants:
   *   omitted      → smart default: {id} if payload has id, else full payload
   *   "*"          → full payload
   *   ["f1","f2"]  → pick named fields
   *   {t: "s", …}  → rename: $trigger.t = payload.s
   */
  import { _ } from '../i18n';
  import SplitPane from './SplitPane.svelte';
  import ViewRenderer from './ViewRenderer.svelte';
  import PanelRenderer from './PanelRenderer.svelte'; // recursive sub-panels

  type PassSpec = '*' | string[] | Record<string, string>;

  interface TriggerConfig {
    event: string;
    from?: string;    // source area id; default: 'content'
    pass?: PassSpec;
  }

  interface SplitArea {
    id: string;
    pos?: 'left' | 'right' | 'top' | 'bottom';
    width?: number;    // px hint for right/left splits
    height?: number;   // px hint for top/bottom splits
    collapsed?: boolean; // start collapsed (can still be expanded by user)
    trigger?: TriggerConfig;
    [key: string]: unknown;
  }

  interface Panel {
    title?: string;
    content?: Record<string, unknown>;
    panels?: SplitArea[];
  }

  interface PanelRendererProps {
    panel: Panel;
    focusRowId?: unknown;
    onEvent?: (area: string, name: string, data: unknown) => void;
    /** Given by a page opened over another one: the header gets a ← back to it. */
    onBack?: () => void;
  }

  let { panel, focusRowId, onEvent: onExternalEvent, onBack }: PanelRendererProps = $props();

  const areas = $derived((panel.panels ?? []) as SplitArea[]);

  // ── Trigger system ────────────────────────────────────────────────────────

  // triggerMap[areaId] = last trigger payload received by that area.
  // $state so that ViewRenderer re-renders reactively when a trigger arrives.
  let triggerMap = $state<Record<string, Record<string, unknown>>>({});

  function extractPass(pass: PassSpec | undefined, payload: Record<string, unknown>): Record<string, unknown> {
    if (pass === undefined) {
      return 'id' in payload ? { id: payload.id } : { ...payload };
    }
    if (pass === '*') return { ...payload };
    if (Array.isArray(pass)) {
      const out: Record<string, unknown> = {};
      for (const f of pass) out[f] = payload[f];
      return out;
    }
    // map: {targetKey: sourceKey}
    const out: Record<string, unknown> = {};
    for (const [target, source] of Object.entries(pass)) out[target] = payload[source];
    return out;
  }

  function handleAreaEvent(sourceId: string, eventName: string, payload: unknown) {
    const data = (payload ?? {}) as Record<string, unknown>;
    onExternalEvent?.(sourceId, eventName, data);
    for (const area of areas) {
      const trig = area.trigger;
      if (!trig) continue;
      if (trig.event === eventName && (trig.from ?? 'content') === sourceId) {
        triggerMap = { ...triggerMap, [area.id]: extractPass(trig.pass, data) };
      }
    }
  }

  // collapsedAreas: set of area IDs whose split pane is currently collapsed.
  // Passed to ViewRenderer so DataView can skip loading while not visible.
  let collapsedAreas = $state(new Set<string>());

  function handleAreaCollapse(areaId: string, isCollapsed: boolean) {
    const next = new Set(collapsedAreas);
    if (isCollapsed) next.add(areaId); else next.delete(areaId);
    collapsedAreas = next;
  }

  // ── Layout helpers ────────────────────────────────────────────────────────

  // Reference dimensions for converting the px hint in YAML to a % for SplitPane.
  // These are rough viewport estimates — SplitPane persists actual sizes in localStorage.
  const REF_H = 1200;   // reference width  for right/left splits
  const REF_V = 800;    // reference height for top/bottom splits

  function areaPercent(area: SplitArea): number {
    const isH = area.pos === 'right' || area.pos === 'left';
    const px  = isH ? (area.width ?? 300) : (area.height ?? 250);
    return Math.round((px / (isH ? REF_H : REF_V)) * 100);
  }
</script>

<div class="flex h-full flex-col">

  {#if panel.title || onBack}
    <div class="kb-panel-header">
      {#if onBack}
        <button class="kb-panel-back" onclick={onBack} title={_('Back')} aria-label={_('Back')}>←</button>
      {/if}
      {#if panel.title}<span class="kb-panel-title">{panel.title}</span>{/if}
    </div>
  {/if}

  <div class="flex-1 min-h-0 overflow-hidden">

    <!--
      Recursive snippet: processes areas[] from END (last element = outermost SplitPane).

      Base case (empty):   render panel.content directly.
      Recursive case:
        head = areas[last]      → current (outermost) SplitPane
        tail = areas[0..last-1] → passed recursively (inner splits + content)

        isAfter = pos is 'right' or 'bottom'
          → content side is snippet a (left/top), panel view is snippet b (right/bottom)
        !isAfter = pos is 'left' or 'top'
          → panel view is snippet a (left/top), content side is snippet b (right/bottom)
    -->
    {#snippet renderSplit(remaining: SplitArea[])}
      {#if remaining.length === 0}

        <!-- Leaf: the actual panel content -->
        <div class="h-full overflow-hidden">
          {#if panel.content}
            <ViewRenderer
              view={panel.content}
              {focusRowId}
              onEvent={(n, d) => handleAreaEvent('content', n, d)}
            />
          {/if}
        </div>

      {:else}
        {@const head    = remaining[remaining.length - 1]}
        {@const tail    = remaining.slice(0, -1)}
        {@const isH     = head.pos === 'right' || head.pos === 'left'}
        {@const dir     = isH ? 'horizontal' : 'vertical'}
        {@const isAfter = head.pos === 'right' || head.pos === 'bottom'}
        {@const sidePct = areaPercent(head)}
        {@const mainPct = 100 - sidePct}

        <SplitPane
          direction={dir}
          defaultSizes={isAfter ? [mainPct, sidePct] : [sidePct, mainPct]}
          minSize={80}
          gutterSize={5}
          collapseTarget={isAfter ? 'b' : 'a'}
          storageKey="panel-{panel.title ?? 'default'}.{head.id}"
          initialCollapsed={head.collapsed === true}
          onCollapse={(isCollapsed) => handleAreaCollapse(head.id, isCollapsed)}
        >
          {#snippet a()}
            {#if isAfter}
              <div class="h-full overflow-hidden">
                {@render renderSplit(tail)}
              </div>
            {:else}
              <div class="h-full overflow-hidden">
                {#if (head as Panel).panels}
                  <PanelRenderer panel={head as Panel} />
                {:else}
                  <ViewRenderer
                    view={head as Record<string, unknown>}
                    trigger={triggerMap[head.id]}
                    collapsed={collapsedAreas.has(head.id)}
                    onEvent={(n, d) => handleAreaEvent(head.id, n, d)}
                  />
                {/if}
              </div>
            {/if}
          {/snippet}

          {#snippet b()}
            {#if isAfter}
              <div class="h-full overflow-hidden">
                {#if (head as Panel).panels}
                  <PanelRenderer panel={head as Panel} />
                {:else}
                  <ViewRenderer
                    view={head as Record<string, unknown>}
                    trigger={triggerMap[head.id]}
                    collapsed={collapsedAreas.has(head.id)}
                    onEvent={(n, d) => handleAreaEvent(head.id, n, d)}
                  />
                {/if}
              </div>
            {:else}
              <div class="h-full overflow-hidden">
                {@render renderSplit(tail)}
              </div>
            {/if}
          {/snippet}
        </SplitPane>

      {/if}
    {/snippet}

    {@render renderSplit(areas)}

  </div>

</div>

<style>
  .kb-panel-header {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 1rem;
    border-bottom: 1px solid var(--kb-border);
    background: var(--kb-surface);
  }
  .kb-panel-back {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    margin-left: -0.5rem;
    border: none;
    border-radius: 0.25rem;
    background: none;
    color: var(--kb-text-subtle);
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;
  }
  .kb-panel-back:hover {
    background: var(--kb-surface-hover);
    color: var(--kb-text);
  }
  .kb-panel-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--kb-text);
  }
</style>
