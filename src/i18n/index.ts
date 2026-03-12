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

const SUPPORTED_LOCALES = ['en', 'de', 'fr', 'es', 'pt', 'ko', 'ja', 'zh-CN', 'zh-TW', 'vi', 'ru', 'it', 'hi', 'el', 'th'] as const

function detectLocale(): string {
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
