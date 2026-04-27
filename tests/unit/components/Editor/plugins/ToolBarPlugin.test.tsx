/** @jest-environment jsdom */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import ToolbarPlugin from '@/components/Editor/plugins/ToolBarPlugin';

jest.mock('@lexical/react/LexicalComposerContext', () => ({
  useLexicalComposerContext: () => [{
    dispatchCommand: jest.fn(),
    registerUpdateListener: jest.fn(() => () => {}),
    registerCommand: jest.fn(() => () => {}),
  }],
}));

describe('ToolbarPlugin', () => {
  it('should render all icon buttons with SVG components', () => {
    render(<ToolbarPlugin />);
    
    const undoButton = screen.getByLabelText('Undo');
    expect(undoButton).toBeInTheDocument();
    expect(undoButton.querySelector('svg')).toBeInTheDocument();
    
    const redoButton = screen.getByLabelText('Redo');
    expect(redoButton).toBeInTheDocument();
    expect(redoButton.querySelector('svg')).toBeInTheDocument();
    
    const boldButton = screen.getByLabelText('Format Bold');
    expect(boldButton).toBeInTheDocument();
    expect(boldButton.querySelector('svg')).toBeInTheDocument();
    
    const italicButton = screen.getByLabelText('Format Italics');
    expect(italicButton).toBeInTheDocument();
    expect(italicButton.querySelector('svg')).toBeInTheDocument();
    
    const underlineButton = screen.getByLabelText('Format Underline');
    expect(underlineButton).toBeInTheDocument();
    expect(underlineButton.querySelector('svg')).toBeInTheDocument();
    
    const strikethroughButton = screen.getByLabelText('Format Strikethrough');
    expect(strikethroughButton).toBeInTheDocument();
    expect(strikethroughButton.querySelector('svg')).toBeInTheDocument();
    
    const leftAlignButton = screen.getByLabelText('Left Align');
    expect(leftAlignButton).toBeInTheDocument();
    expect(leftAlignButton.querySelector('svg')).toBeInTheDocument();
    
    const centerAlignButton = screen.getByLabelText('Center Align');
    expect(centerAlignButton).toBeInTheDocument();
    expect(centerAlignButton.querySelector('svg')).toBeInTheDocument();
    
    const rightAlignButton = screen.getByLabelText('Right Align');
    expect(rightAlignButton).toBeInTheDocument();
    expect(rightAlignButton.querySelector('svg')).toBeInTheDocument();
    
    const justifyAlignButton = screen.getByLabelText('Justify Align');
    expect(justifyAlignButton).toBeInTheDocument();
    expect(justifyAlignButton.querySelector('svg')).toBeInTheDocument();
  });

  it('should have format-icon class on all SVG icons', () => {
    render(<ToolbarPlugin />);
    
    const formatIcons = document.querySelectorAll('.format-icon');
    expect(formatIcons.length).toBeGreaterThan(0);
  });
});
