import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en/translation.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'he', name: 'עברית' },
  { code: 'ru', name: 'Русский' },
  { code: 'de', name: 'Deutsch' },
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]['code'];

export const RTL_LANGUAGES: SupportedLanguage[] = ['he'];

const languageResources: Partial<
  Record<SupportedLanguage, () => Promise<{ default: Record<string, unknown> }>>
> = {
  es: () => import('./locales/es/translation.json'),
  he: () => import('./locales/he/translation.json'),
  ru: () => import('./locales/ru/translation.json'),
  de: () => import('./locales/de/translation.json'),
};

void i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
  interpolation: { escapeValue: false },
  resources: { en: { translation: en } },
});

function isSupportedLanguage(lang: string): lang is SupportedLanguage {
  return SUPPORTED_LANGUAGES.some((l) => l.code === lang);
}

export async function loadLanguage(lang: string): Promise<void> {
  if (!isSupportedLanguage(lang)) {
    await i18n.changeLanguage('en');
    return;
  }
  if (lang === 'en' || i18n.hasResourceBundle(lang, 'translation')) {
    await i18n.changeLanguage(lang);
    return;
  }
  const loader = languageResources[lang];
  if (loader) {
    const mod = await loader();
    i18n.addResourceBundle(lang, 'translation', mod.default);
  }
  await i18n.changeLanguage(lang);
}

export default i18n;
