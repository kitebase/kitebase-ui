/**
 * Placeholders of a mail template, `[[partner.name]]` or `[[$note]]`, in the
 * editor: plain text, shown as a token. Being text, a placeholder takes bold
 * or italic like the words around it, and is copied and pasted as it reads.
 *
 * Two things make it work. A decoration marks every `[[...]]` of the document
 * with the class `kb-placeholder`, recomputed on each change. And the markdown
 * the editor writes leaves placeholders as they are: the serializer escapes
 * `[`, `]` and `_` in text, which would turn `[[partner_id]]` into
 * `\[\[partner\_id\]\]`, a text the server no longer recognises.
 */
import { Extension } from '@tiptap/core';
import type { MarkdownManager } from '@tiptap/markdown';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/** The grammar of the server (smtp/templates.py), as a source to build from. */
const NAME = String.raw`\[\[\s*\$?[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*\s*\]\]`;

/** Every placeholder of a text. */
export const PLACEHOLDERS = new RegExp(NAME, 'g');

/** A text split so that the placeholders are at the odd indexes. */
const SPLIT = new RegExp(`(${NAME})`);

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    placeholders: {
      /** Insert `[[name]]` at the cursor. */
      insertPlaceholder: (name: string) => ReturnType;
    };
  }
}

/**
 * Make a markdown manager leave placeholders unescaped. It replaces a private
 * method of @tiptap/markdown, the one that backslash-escapes text: the test of
 * this module fails if a new version renames it.
 */
export function keepPlaceholders(manager: MarkdownManager): void {
  const target = manager as unknown as { escapeMarkdownSyntax: (text: string) => string };
  const escape = target.escapeMarkdownSyntax.bind(manager);
  target.escapeMarkdownSyntax = (text: string) =>
    text.split(SPLIT).map((part, i) => (i % 2 ? part : escape(part))).join('');
}

function decorate(doc: PMNode): DecorationSet {
  const found: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    for (const match of node.text.matchAll(PLACEHOLDERS)) {
      const from = pos + (match.index ?? 0);
      found.push(Decoration.inline(from, from + match[0].length, { class: 'kb-placeholder' }));
    }
  });
  return DecorationSet.create(doc, found);
}

const key = new PluginKey<DecorationSet>('placeholders');

export const Placeholders = Extension.create({
  name: 'placeholders',

  onCreate() {
    if (this.editor.markdown) keepPlaceholders(this.editor.markdown);
  },

  addCommands() {
    return {
      insertPlaceholder: (name: string) => ({ commands }) =>
        commands.insertContent(`[[${name}]]`)
    };
  },

  addProseMirrorPlugins() {
    return [new Plugin<DecorationSet>({
      key,
      state: {
        init: (_config, state) => decorate(state.doc),
        apply: (tr, old) => (tr.docChanged ? decorate(tr.doc) : old)
      },
      props: {
        decorations: (state) => key.getState(state)
      }
    })];
  }
});
