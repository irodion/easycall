import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithProviders } from '@/test/helpers';
import { LanguageSelector } from './LanguageSelector';
import { SUPPORTED_LANGUAGES } from '@/i18n';

describe('LanguageSelector', () => {
  it('renders a radio for each supported language', () => {
    renderWithProviders(<LanguageSelector value="en" onChange={vi.fn()} />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(SUPPORTED_LANGUAGES.length);
  });

  it('renders language names as labels', () => {
    renderWithProviders(<LanguageSelector value="en" onChange={vi.fn()} />);
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(screen.getByText(lang.name)).toBeInTheDocument();
    }
  });

  it('checks the radio matching the current value', () => {
    renderWithProviders(<LanguageSelector value="he" onChange={vi.fn()} />);
    const hebrewRadio = screen.getByRole('radio', { name: 'עברית' }) as HTMLInputElement;
    expect(hebrewRadio.checked).toBe(true);
  });

  it('calls onChange with the selected language code', () => {
    const onChange = vi.fn();
    renderWithProviders(<LanguageSelector value="en" onChange={onChange} />);
    fireEvent.click(screen.getByText('Español'));
    expect(onChange).toHaveBeenCalledWith('es');
  });

  it('passes accessibility checks', async () => {
    const { container } = renderWithProviders(<LanguageSelector value="en" onChange={vi.fn()} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
