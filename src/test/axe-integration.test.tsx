import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';

describe('vitest-axe integration', () => {
  it('passes for accessible markup', async () => {
    const { container } = render(<button>Click me</button>);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('flags color-contrast as incomplete in jsdom (needs review)', async () => {
    // jsdom doesn't implement getComputedStyle fully, so axe-core
    // reports color-contrast as "incomplete" (needs manual review)
    // rather than a hard violation. In a real browser (Playwright),
    // this would be a violation.
    const { container } = render(
      <div style={{ backgroundColor: '#fff' }}>
        <p style={{ color: '#eee' }}>Low contrast text</p>
      </div>,
    );
    const results = await axe(container);
    const contrastIncomplete = results.incomplete.find(
      (v) => v.id === 'color-contrast',
    );
    expect(contrastIncomplete).toBeDefined();
  });

  it('detects missing form labels', async () => {
    const { container } = render(<input type="text" />);
    const results = await axe(container);
    const labelViolation = results.violations.find(
      (v) => v.id === 'label',
    );
    expect(labelViolation).toBeDefined();
  });
});
