/** @jest-environment jsdom */

import { customParser, customSerializer } from '@/prosemirror/parser';
import { markdownSchema } from '@/prosemirror/schema';
import { EditorState } from 'prosemirror-state';

function parse(md: string) {
  return customParser.parse(md);
}

function serialize(doc: any): string {
  return customSerializer.serialize(doc);
}

/**
 * Idempotency: parse(serialize(parse(md))) should produce the same document.
 * This is the true test of round-trip correctness.
 */
function structuralRoundTrip(md: string): boolean {
  const doc1 = parse(md);
  const serialized = serialize(doc1);
  const doc2 = parse(serialized);
  return doc1.eq(doc2);
}

function stringRoundTrip(md: string): string {
  return serialize(parse(md));
}

describe('Markdown parser/serializer', () => {
  describe('should round-trip paragraphs', () => {
    it('should structurally preserve simple paragraph', () => {
      expect(structuralRoundTrip('Hello world')).toBe(true);
    });

    it('should preserve simple paragraph string', () => {
      expect(stringRoundTrip('Hello world')).toBe('Hello world');
    });
  });

  describe('should round-trip headings', () => {
    for (let level = 1; level <= 6; level++) {
      it(`should structurally preserve H${level}`, () => {
        const input = '#'.repeat(level) + ' Heading';
        expect(structuralRoundTrip(input)).toBe(true);
      });
    }
  });

  describe('should round-trip lists', () => {
    it('should structurally preserve bullet list', () => {
      expect(structuralRoundTrip('- item 1\n- item 2')).toBe(true);
      expect(structuralRoundTrip('- item 1\n- item 2\n- item 3')).toBe(true);
    });

    it('should structurally preserve ordered list', () => {
      expect(structuralRoundTrip('1. first\n2. second')).toBe(true);
    });
  });

  describe('should round-trip task list', () => {
    it('should structurally preserve unchecked task list', () => {
      expect(structuralRoundTrip('- [ ] todo item')).toBe(true);
    });

    it('should structurally preserve checked task list', () => {
      expect(structuralRoundTrip('- [x] done item')).toBe(true);
    });
  });

  describe('should round-trip code blocks', () => {
    it('should structurally preserve fenced code block', () => {
      expect(structuralRoundTrip('```\ncode\n```')).toBe(true);
    });

    it('should structurally preserve fenced code block with language', () => {
      expect(structuralRoundTrip('```typescript\nconst x = 1;\n```')).toBe(true);
    });
  });

  describe('should round-trip horizontal rule', () => {
    it('should structurally preserve horizontal rule', () => {
      expect(structuralRoundTrip('---')).toBe(true);
    });
  });

  describe('should round-trip inline styles', () => {
    it('should structurally preserve bold', () => {
      expect(structuralRoundTrip('**bold**')).toBe(true);
    });

    it('should structurally preserve italic', () => {
      expect(structuralRoundTrip('*italic*')).toBe(true);
    });

    it('should structurally preserve strikethrough', () => {
      expect(structuralRoundTrip('~~strike~~')).toBe(true);
    });

    it('should structurally preserve inline code', () => {
      expect(structuralRoundTrip('`code`')).toBe(true);
    });

    it('should structurally preserve link', () => {
      expect(structuralRoundTrip('[text](https://example.com)')).toBe(true);
    });

    it('should structurally preserve link with title', () => {
      expect(structuralRoundTrip('[text](https://example.com "title")')).toBe(true);
    });
  });

  describe('should round-trip blockquote', () => {
    it('should structurally preserve blockquote', () => {
      expect(structuralRoundTrip('> quoted text')).toBe(true);
    });
  });

  describe('should round-trip image', () => {
    it('should structurally preserve image', () => {
      expect(structuralRoundTrip('![alt](https://example.com/img.png)')).toBe(true);
    });
  });

  describe('should round-trip complex documents', () => {
    it('should structurally preserve multi-block document', () => {
      const input = '# Title\n\nParagraph.\n\n- item 1\n- item 2\n\n```\ncode\n```';
      expect(structuralRoundTrip(input)).toBe(true);
    });

    it('should structurally preserve bold in list item', () => {
      expect(structuralRoundTrip('- **bold** item')).toBe(true);
    });

    it('should structurally preserve mixed inline marks', () => {
      expect(structuralRoundTrip('**bold *and italic* text**')).toBe(true);
    });
  });

  describe('serializer produces valid markdown', () => {
    it('should produce parseable output for paragraph', () => {
      const output = stringRoundTrip('Hello world');
      expect(() => parse(output)).not.toThrow();
    });

    it('should produce parseable output for complex doc', () => {
      const output = stringRoundTrip('# Title\n\nPara\n\n- a\n- b\n\n```\ncode\n```');
      expect(() => parse(output)).not.toThrow();
    });
  });
});
