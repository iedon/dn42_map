import { createApp } from 'vue'
import App from './App.vue'
import i18n from './i18n'
import './styles/main.scss'

const locale = i18n.global.locale as unknown as { value: string }
document.documentElement.lang = locale.value
document.title = i18n.global.t('pageTitle')

createApp(App).use(i18n).mount('#app')
