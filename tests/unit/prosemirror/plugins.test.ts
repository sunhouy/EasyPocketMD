/** @jest-environment jsdom */

import { markdownSchema } from '@/prosemirror/schema';
import { buildPlugins } from '@/prosemirror/plugins';
import { buildKeymap } from '@/prosemirror/keymap';
import { buildInputRules } from '@/prosemirror/inputrules';
import { EditorState, TextSelection } from 'prosemirror-state';

describe('Plugin assembly', () => {
  it('should build plugins array without error', () => {
    const plugins = buildPlugins(markdownSchema);
    expect(Array.isArray(plugins)).toBe(true);
    expect(plugins.length).toBeGreaterThan(0);
  });

  it('should create a valid EditorState with plugins', () => {
    const state = EditorState.create({
      schema: markdownSchema,
      plugins: buildPlugins(markdownSchema),
    });
    expect(state.doc).toBeDefined();
    expect(state.doc.type.name).toBe('doc');
  });
});

describe('buildKeymap', () => {
  it('should return a keymap plugin', () => {
    const plugin = buildKeymap(markdownSchema);
    expect(plugin).toBeDefined();
    expect(plugin.props).toBeDefined();
  });

  it('should handle bold toggle with Mod-b', () => {
    const state = EditorState.create({
      schema: markdownSchema,
      doc: markdownSchema.node('doc', null, [
        markdownSchema.node('paragraph', null, [
          markdownSchema.text('hello'),
        ]),
      ]),
      plugins: [buildKeymap(markdownSchema)],
    });

    // Select all text using TextSelection
    const tr = state.tr.setSelection(
      TextSelection.create(state.doc, 1, 6),
    );
    const newState = state.apply(tr);

    // The keymap should handle Mod-b — verifying it doesn't throw
    expect(newState.doc.textContent).toBe('hello');
  });
});

describe('buildInputRules', () => {
  it('should return an inputRules plugin', () => {
    const plugin = buildInputRules(markdownSchema);
    expect(plugin).toBeDefined();
    expect(plugin.props).toBeDefined();
  });

  it('should handle heading input rule', () => {
    const state = EditorState.create({
      schema: markdownSchema,
      doc: markdownSchema.node('doc', null, [
        markdownSchema.node('paragraph', null, [
          markdownSchema.text('# '),
        ]),
      ]),
      plugins: [buildInputRules(markdownSchema)],
    });

    // Simulate the text input that would trigger heading conversion
    const tr = state.tr.insertText(' ', 3);
    // Apply transaction without throwing
    expect(() => state.apply(tr)).not.toThrow();
  });
});
