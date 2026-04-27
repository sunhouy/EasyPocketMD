/** @jest-environment jsdom */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import { TypeBold, ArrowClockwise } from '@/components/Icons';

describe('Icons', () => {
  it('should render TypeBold icon as SVG component', () => {
    render(<TypeBold width={24} height={24} fill="currentColor" />);
    const svgElement = screen.getByRole('img', { hidden: true }) as SVGSVGElement;
    expect(svgElement).toBeInTheDocument();
    expect(svgElement.tagName).toBe('svg');
    expect(svgElement.getAttribute('width')).toBe('24');
    expect(svgElement.getAttribute('height')).toBe('24');
  });

  it('should render ArrowClockwise icon with custom props', () => {
    render(<ArrowClockwise width={32} height={32} fill="#333" />);
    const svgElement = screen.getByRole('img', { hidden: true }) as SVGSVGElement;
    expect(svgElement).toBeInTheDocument();
    expect(svgElement.getAttribute('width')).toBe('32');
    expect(svgElement.getAttribute('fill')).toBe('#333');
  });

  it('should apply className when provided', () => {
    const { container } = render(<TypeBold className="test-icon" />);
    const svgElement = container.querySelector('svg.test-icon');
    expect(svgElement).toBeInTheDocument();
  });

  it('should apply style when provided', () => {
    const { container } = render(<ArrowClockwise style={{ color: 'red' }} />);
    const svgElement = container.querySelector('svg');
    expect(svgElement).toHaveStyle({ color: 'red' });
  });
});
