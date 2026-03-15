import { createI18n } from 'vue-i18n'

import en from './locales/en.json'
import de from './locales/de.json'
import fr from './locales/fr.json'
import es from './locales/es.json'
import pt from './locales/pt.json'
import ko from './locales/ko.json'
import ja from './locales/ja.json'
import zhCN from './locales/zh-CN.json'
import zhTW from './locales/zh-TW.json'
import vi from './locales/vi.json'
import ru from './locales/ru.json'
import it from './locales/it.json'
import hi from './locales/hi.json'
import el from './locales/el.json'
import th from './locales/th.json'

type MessageSchema = typeof en

export const SUPPORTED_LOCALES = ['en', 'de', 'fr', 'es', 'pt', 'ko', 'ja', 'zh-CN', 'zh-TW', 'vi', 'ru', 'it', 'hi', 'el', 'th'] as const

export const LOCALE_NAMES: Record<string, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Fran\u00e7ais',
  es: 'Espa\u00f1ol',
  pt: 'Portugu\u00eas',
  ko: '\ud55c\uad6d\uc5b4',
  ja: '\u65e5\u672c\u8a9e',
  'zh-CN': '\u7b80\u4f53\u4e2d\u6587',
  'zh-TW': '\u7e41\u9ad4\u4e2d\u6587',
  vi: 'Ti\u1ebfng Vi\u1ec7t',
  ru: '\u0420\u0443\u0441\u0441\u043a\u0438\u0439',
  it: 'Italiano',
  hi: '\u0939\u093f\u0928\u094d\u0926\u0940',
  el: '\u0395\u03bb\u03bb\u03b7\u03bd\u03b9\u03ba\u03ac',
  th: '\u0e44\u0e17\u0e22',
}

export function detectLocale(): string {
  for (const lang of navigator.languages) {
    const exact = SUPPORTED_LOCALES.find(l => l === lang)
    if (exact) return exact

    const base = lang.split('-')[0]
    if (base === 'zh') {
      if (lang.includes('TW') || lang.includes('Hant') || lang.includes('HK') || lang.includes('MO')) return 'zh-TW'
      return 'zh-CN'
    }

    const match = SUPPORTED_LOCALES.find(l => l === base)
    if (match) return match
  }
  return 'en'
}

const i18n = createI18n<[MessageSchema], string>({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: 'en',
  messages: {
    en, de, fr, es, pt, ko, ja,
    'zh-CN': zhCN,
    'zh-TW': zhTW,
    vi, ru, it, hi, el, th,
  },
})

export default i18n
