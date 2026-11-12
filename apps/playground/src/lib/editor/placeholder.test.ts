/**
 * The criterion of the editor prototype: markdown read into the editor's
 * document and written back loses nothing, and a placeholder survives as
 * `[[name]]`, never escaped, with the formatting around it. Run without a
 * browser: the markdown manager works on the document's JSON, the same the
 * editor holds.
 */
import { describe, expect, it } from 'vitest';
import { resolveExtensions } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { MarkdownManager } from '@tiptap/markdown';
import { keepPlaceholders, PLACEHOLDERS } from './placeholder';

const manager = new MarkdownManager({ extensions: resolveExtensions([StarterKit]) });
keepPlaceholders(manager);

const roundtrip = (md: string) => manager.serialize(manager.parse(md));

describe('markdown round-trip', () => {
  it.each([
    'Dear [[partner.name]],',
    'A **bold** word, an *italic* one and a [link](https://example.com).',
    '# Title\n\nA paragraph.',
    '- one\n- two\n- three',
    '1. first\n2. second',
    'Your invoice [[number]] of [[date]].\n\n[[$note]]',
    '**[[partner.name]]** owes [[balance]].',
    'Hello *[[partner_id.first_name]]*, see [[$due_date]].',
    '- [[name]]\n- **[[agent.name]]**',
  ])('keeps %j', (md) => {
    expect(roundtrip(md)).toBe(md);
  });

  it('still escapes what is not a placeholder', () => {
    expect(roundtrip('An [[array, 2]] and a_b.')).toBe('An \\[\\[array, 2\\]\\] and a\\_b.');
  });

  it('finds the placeholders the server finds', () => {
    const text = 'x [[ a.b ]] [[$c]] [[1]] [[d e]] [[f_g.h]]';
    expect([...text.matchAll(PLACEHOLDERS)].map((m) => m[0])).toEqual(
      ['[[ a.b ]]', '[[$c]]', '[[f_g.h]]']);
  });
});
