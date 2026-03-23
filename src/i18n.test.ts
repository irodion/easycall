import { describe, it, expect, afterEach } from 'vitest';
import i18n, {
  loadLanguage,
  RTL_LANGUAGES,
  SUPPORTED_LANGUAGES,
  detectBrowserLanguage,
} from './i18n';

describe('i18n', () => {
  afterEach(async () => {
    await loadLanguage('en');
  });

  it('initializes with English as default language', () => {
    expect(i18n.language).toBe('en');
  });

  it('has English translations loaded', () => {
    expect(i18n.hasResourceBundle('en', 'translation')).toBe(true);
  });

  it('resolves English translation keys', () => {
    expect(i18n.t('home.title')).toBe('Contacts');
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
  });

  it('loadLanguage loads Hebrew', async () => {
    await loadLanguage('he');
    expect(i18n.hasResourceBundle('he', 'translation')).toBe(true);
    expect(i18n.language).toBe('he');
  });

  it('loadLanguage loads Russian', async () => {
    await loadLanguage('ru');
    expect(i18n.hasResourceBundle('ru', 'translation')).toBe(true);
  });

  it('loadLanguage loads German', async () => {
    await loadLanguage('de');
    expect(i18n.hasResourceBundle('de', 'translation')).toBe(true);
  });
});

describe('detectBrowserLanguage', () => {
  const originalLanguages = navigator.languages;
  const originalLanguage = navigator.language;

  afterEach(() => {
    Object.defineProperty(navigator, 'languages', {
      value: originalLanguages,
      configurable: true,
    });
    Object.defineProperty(navigator, 'language', {
      value: originalLanguage,
      configurable: true,
    });
  });

  it('returns es when browser prefers es-MX', () => {
    Object.defineProperty(navigator, 'languages', {
      value: ['es-MX', 'en'],
      configurable: true,
    });
    expect(detectBrowserLanguage()).toBe('es');
  });

  it('returns de when browser prefers de-AT', () => {
    Object.defineProperty(navigator, 'languages', {
      value: ['de-AT'],
      configurable: true,
    });
    expect(detectBrowserLanguage()).toBe('de');
  });

  it('returns he when browser prefers he-IL', () => {
    Object.defineProperty(navigator, 'languages', {
      value: ['he-IL'],
      configurable: true,
    });
    expect(detectBrowserLanguage()).toBe('he');
  });

  it('falls back to navigator.language when languages is unavailable', () => {
    Object.defineProperty(navigator, 'languages', {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(navigator, 'language', {
      value: 'ru',
      configurable: true,
    });
    expect(detectBrowserLanguage()).toBe('ru');
  });

  it('returns en when no supported language matches', () => {
    Object.defineProperty(navigator, 'languages', {
      value: ['fr', 'ja'],
      configurable: true,
    });
    expect(detectBrowserLanguage()).toBe('en');
  });

  it('returns first supported match from languages list', () => {
    Object.defineProperty(navigator, 'languages', {
      value: ['fr', 'ru', 'de'],
      configurable: true,
    });
    expect(detectBrowserLanguage()).toBe('ru');
  });

  it('returns en when languages is empty', () => {
    Object.defineProperty(navigator, 'languages', {
      value: [],
      configurable: true,
    });
    expect(detectBrowserLanguage()).toBe('en');
  });

  it('returns en for default jsdom environment (en-US)', () => {
    // jsdom sets navigator.language to 'en-US' by default
    expect(detectBrowserLanguage()).toBe('en');
  });
});
