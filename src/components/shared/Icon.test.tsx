import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { Icon } from './Icon';
import type { IconName } from './Icon';

const ALL_ICONS: IconName[] = [
  'mic',
  'mic-off',
  'camera',
  'camera-off',
  'phone-end',
  'settings',
  'close',
  'plus',
  'arrow-left',
  'phone',
  'backspace',
];

describe('Icon', () => {
  it.each(ALL_ICONS)('renders SVG element for icon "%s"', (name) => {
    const { container } = render(<Icon name={name} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg!.querySelector('path')).toBeInTheDocument();
  });

  it('default size is 24x24', () => {
    const { container } = render(<Icon name="mic" />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('24');
    expect(svg.getAttribute('height')).toBe('24');
  });

  it('custom size prop changes width/height', () => {
    const { container } = render(<Icon name="mic" size={32} />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('32');
    expect(svg.getAttribute('height')).toBe('32');
  });

  it('className is forwarded to svg element', () => {
    const { container } = render(<Icon name="mic" className="text-red-500" />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveClass('text-red-500');
  });

  it('aria-hidden defaults to true', () => {
    const { container } = render(<Icon name="mic" />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
  });

  it('aria-hidden can be set to false', () => {
    const { container } = render(<Icon name="mic" aria-hidden={false} />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('false');
  });

  it('passes vitest-axe accessibility check', async () => {
    const { container } = render(
      <button aria-label="Mute">
        <Icon name="mic" />
      </button>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
