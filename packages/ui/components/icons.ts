/**
 * Resolves a kebab-case lucide icon name (as used in `menu_items.*.icon` /
 * `chrome` descriptors, e.g. "file-text", "flask-conical") to its Svelte
 * component from @lucide/svelte, which exports icons as named PascalCase
 * exports (FileText, FlaskConical, ...).
 */
import * as Icons from '@lucide/svelte';
import type { Component } from 'svelte';

const cache = new Map<string, Component | null>();

function toPascalCase(name: string): string {
  return name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

export function resolveIcon(name?: string): Component | null {
  if (!name) return null;
  if (cache.has(name)) return cache.get(name) ?? null;
  const icon = (Icons as unknown as Record<string, Component>)[toPascalCase(name)] ?? null;
  cache.set(name, icon);
  return icon;
}
