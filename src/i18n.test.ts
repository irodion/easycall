import { describe, it, expect } from 'vitest';
import i18n, { loadLanguage, RTL_LANGUAGES, SUPPORTED_LANGUAGES } from './i18n';

describe('i18n', () => {
  it('initializes with English as default language', () => {
    expect(i18n.language).toBe('en');
  });

  it('has English translations loaded', () => {
    expect(i18n.hasResourceBundle('en', 'translation')).toBe(true);
  });

  it('resolves English translation keys', () => {
    expect(i18n.t('home.title')).toBe('Your Contacts');
    expect(i18n.t('common.cancel')).toBe('Cancel');
  });

  it('supports interpolation', () => {
    expect(i18n.t('home.callContact', { name: 'Alice' })).toBe('Call Alice');
  });

  it('RTL_LANGUAGES includes Hebrew', () => {
    expect(RTL_LANGUAGES).toContain('he');
  });

  it('SUPPORTED_LANGUAGES has 5 entries', () => {
    expect(SUPPORTED_LANGUAGES).toHaveLength(5);
    const codes = SUPPORTED_LANGUAGES.map((l) => l.code);
    expect(codes).toEqual(['en', 'es', 'he', 'ru', 'de']);
  });

  it('loadLanguage loads non-English language', async () => {
    await loadLanguage('es');
    expect(i18n.hasResourceBundle('es', 'translation')).toBe(true);
    expect(i18n.language).toBe('es');
    // Restore
    await loadLanguage('en');
  });

  it('loadLanguage for English does not need lazy load', async () => {
    await loadLanguage('en');
    expect(i18n.language).toBe('en');
  });

  it('falls back to English for missing keys', () => {
    expect(i18n.t('skipToContent')).toBe('Skip to content');
  });

  it('loadLanguage for unsupported language falls back to English', async () => {
    await loadLanguage('fr');
    // Falls back to English since 'fr' is not in supportedLngs
    expect(i18n.language).toBe('en');
  });

  it('loadLanguage does not re-import already loaded language', async () => {
    // Load Spanish first time
    await loadLanguage('es');
    expect(i18n.hasResourceBundle('es', 'translation')).toBe(true);
    // Load again — should skip import since bundle already loaded
    await loadLanguage('es');
    expect(i18n.language).toBe('es');
    await loadLanguage('en');
  });

  it('loadLanguage loads Hebrew', async () => {
    await loadLanguage('he');
    expect(i18n.hasResourceBundle('he', 'translation')).toBe(true);
    expect(i18n.language).toBe('he');
    await loadLanguage('en');
  });

  it('loadLanguage loads Russian', async () => {
    await loadLanguage('ru');
    expect(i18n.hasResourceBundle('ru', 'translation')).toBe(true);
    await loadLanguage('en');
  });

  it('loadLanguage loads German', async () => {
    await loadLanguage('de');
    expect(i18n.hasResourceBundle('de', 'translation')).toBe(true);
    await loadLanguage('en');
  });
});
