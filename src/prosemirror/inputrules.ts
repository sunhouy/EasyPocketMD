import {
  inputRules,
  wrappingInputRule,
  textblockTypeInputRule,
} from 'prosemirror-inputrules';
import { NodeType, Schema } from 'prosemirror-model';

export function buildInputRules(schema: Schema) {
  const { nodes } = schema;

  const rules = [
    // Headings: # Space → H1, ## Space → H2, etc.
    ...([1, 2, 3, 4, 5, 6] as const).map((level) =>
      textblockTypeInputRule(
        new RegExp(`^#{1,${level}}\\s$`),
        nodes.heading,
        () => ({ level }),
      ),
    ),

    // Blockquote: > Space → blockquote
    wrappingInputRule(/^\s*>\s$/, nodes.blockquote),

    // Bullet list: - /* /+ Space → bullet list item
    wrappingInputRule(/^\s*[-*+]\s$/, nodes.bullet_list),

    // Ordered list: 1. Space → ordered list item
    wrappingInputRule(
      /^(\d+)[.)]\s$/,
      nodes.ordered_list,
      (match) => ({ order: parseInt(match[1], 10) }),
      (_, node) => node.childCount + node.attrs.order === 0,
    ),

    // Code block: ``` Space → code_block
    textblockTypeInputRule(/^```$/, nodes.code_block),

    // Task item: - [ ] Space → task_item
    textblockTypeInputRule(
      /^- \[ \]\s$/,
      nodes.task_item,
      { checked: false },
    ),

    // Task item checked: - [x] Space → task_item
    textblockTypeInputRule(
      /^- \[[xX]\]\s$/,
      nodes.task_item,
      { checked: true },
    ),
  ];

  return inputRules({ rules });
}
