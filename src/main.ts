import { createApp } from 'vue'
import App from './App.vue'
import i18n, { detectLocale } from './i18n'
import { loadSettings } from './utils/settings'
import './styles/main.scss'

const settings = loadSettings()
const locale = i18n.global.locale as unknown as { value: string }
locale.value = settings.locale || detectLocale()
document.documentElement.lang = locale.value
document.title = i18n.global.t('pageTitle')

createApp(App).use(i18n).mount('#app')
