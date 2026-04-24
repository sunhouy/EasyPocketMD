/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProseMirrorEditor from '@/components/ProseMirrorEditor';

jest.mock('prosemirror-view', () => {
  const actual = jest.requireActual('prosemirror-view');
  return {
    ...actual,
    EditorView: jest.fn().mockImplementation(() => ({
      state: {},
      dom: document.createElement('div'),
      dispatch: jest.fn(),
      updateState: jest.fn(),
      destroy: jest.fn(),
      focus: jest.fn(),
    })),
  };
});

describe('ProseMirrorEditor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render editor container', () => {
    render(
      <ProseMirrorEditor
        fileId="test-1"
        initialContent="# Hello"
        className="test-editor"
      />,
    );
    const container = document.querySelector('.prosemirror-editor-container');
    expect(container).toBeInTheDocument();
  });

  it('should render children', () => {
    render(
      <ProseMirrorEditor
        fileId="test-1"
        initialContent="# Hello"
      >
        <span data-testid="child">child content</span>
      </ProseMirrorEditor>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('should accept className prop', () => {
    render(
      <ProseMirrorEditor
        fileId="test-1"
        initialContent=""
        className="custom-class"
      />,
    );
    const editor = document.querySelector('.custom-class');
    expect(editor).not.toBeNull();
  });
});
