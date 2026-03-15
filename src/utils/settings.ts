import type { AppSettings } from '@/types'

const STORAGE_KEY = 'dn42map_settings'

export const DEFAULT_SETTINGS: Readonly<AppSettings> = {
  locale: '',
  afFilter: 0,
  centerMode: 'index',
  centerAsn: '',
  autoShowNodeInfo: false,
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return { ...DEFAULT_SETTINGS, ...parsed }
    }
  } catch { /* ignore corrupted data */ }
  saveSettings({ ...DEFAULT_SETTINGS })
  return { ...DEFAULT_SETTINGS }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}
