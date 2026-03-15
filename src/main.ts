import { createApp } from 'vue'
import App from './App.vue'
import i18n, { applyLocale } from './i18n'
import { loadSettings } from './utils/settings'
import './styles/main.scss'

applyLocale(loadSettings().locale)
createApp(App).use(i18n).mount('#app')
