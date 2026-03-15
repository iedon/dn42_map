<template>
  <Teleport to="body">
    <div v-if="visible" class="settings-overlay" :class="{ show: visible }" @click.self="$emit('close')">
      <div class="settings-popup">
        <!-- Header -->
        <div class="settings-header">
          <h2 class="settings-title">{{ $t('settings.title') }}</h2>
          <button class="settings-close" aria-label="Close" @click="$emit('close')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        <!-- Content -->
        <div class="settings-content">
          <!-- Language -->
          <div class="settings-field">
            <label class="settings-label">{{ $t('settings.language') }}</label>
            <select v-model="form.locale" class="settings-select">
              <option value="">{{ $t('settings.browserPreferred') }}</option>
              <option v-for="loc in locales" :key="loc.code" :value="loc.code">{{ loc.name }}</option>
            </select>
          </div>

          <!-- AF Filter -->
          <div class="settings-field">
            <label class="settings-label">{{ $t('settings.afFilter') }}</label>
            <select v-model.number="form.afFilter" class="settings-select">
              <option v-for="af in afOptions" :key="af.value" :value="af.value">{{ af.label }}</option>
            </select>
          </div>

          <!-- Center Mode -->
          <div class="settings-field">
            <label class="settings-label">{{ $t('settings.centerNode') }}</label>
            <div class="settings-radios">
              <label class="settings-radio">
                <input type="radio" v-model="form.centerMode" value="index">
                <span>{{ $t('settings.centerByIndex') }}</span>
              </label>
              <label class="settings-radio">
                <input type="radio" v-model="form.centerMode" value="custom">
                <span>{{ $t('settings.centerByCustom') }}</span>
              </label>
            </div>
            <input
              v-if="form.centerMode === 'custom'"
              v-model="form.centerAsn"
              type="text"
              class="settings-input"
              :placeholder="$t('settings.centerAsnPlaceholder')"
              @input="onAsnInput"
            >
          </div>

          <!-- Auto Show Node Info -->
          <div class="settings-field">
            <label class="settings-label">{{ $t('settings.autoShowNodeInfo') }}</label>
            <div class="settings-radios">
              <label class="settings-radio">
                <input type="radio" v-model="form.autoShowNodeInfo" :value="true">
                <span>{{ $t('settings.yes') }}</span>
              </label>
              <label class="settings-radio">
                <input type="radio" v-model="form.autoShowNodeInfo" :value="false">
                <span>{{ $t('settings.no') }}</span>
              </label>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="settings-footer">
          <button class="settings-btn settings-btn-reset" @click="onReset">{{ $t('settings.reset') }}</button>
          <button class="settings-btn settings-btn-save" @click="onSave">{{ $t('settings.save') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { reactive, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { SUPPORTED_LOCALES, LOCALE_NAMES } from '@/i18n'
import { AF_OPTIONS, AF_LABEL_KEYS } from '@/stores/mapStore'
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '@/utils/settings'
import type { AppSettings } from '@/types'

const { t } = useI18n()

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
  saved: [settings: AppSettings]
}>()

const locales = SUPPORTED_LOCALES.map(code => ({ code, name: LOCALE_NAMES[code] || code }))

const afOptions = computed(() =>
  AF_OPTIONS.map(v => ({ value: v, label: t(AF_LABEL_KEYS[v]).replace('\n', ' ') })),
)

const form = reactive<AppSettings>({ ...DEFAULT_SETTINGS })

function syncFromStorage() {
  const saved = loadSettings()
  Object.assign(form, saved)
}

function onAsnInput() {
  form.centerAsn = form.centerAsn.replace(/\D/g, '')
}

function onReset() {
  Object.assign(form, { ...DEFAULT_SETTINGS })
}

function onSave() {
  if (form.centerMode === 'custom' && !form.centerAsn.trim()) {
    alert(t('settings.centerAsnRequired'))
    return
  }
  const settings: AppSettings = { ...form }
  saveSettings(settings)
  emit('saved', settings)
  emit('close')
}

watch(() => props.visible, (v) => {
  if (v) syncFromStorage()
})
</script>
