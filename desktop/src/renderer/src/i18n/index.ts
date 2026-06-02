import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import enCommon from './resources/en/common.json'
import enBoard from './resources/en/board.json'
import enDrawer from './resources/en/drawer.json'
import enReview from './resources/en/review.json'
import enSettings from './resources/en/settings.json'
import enDomain from './resources/en/domain.json'
import enErrors from './resources/en/errors.json'
import enDetail from './resources/en/detail.json'
import enItemDetail from './resources/en/itemDetail.json'
import enOnboarding from './resources/en/onboarding.json'

import zhCommon from './resources/zh-CN/common.json'
import zhBoard from './resources/zh-CN/board.json'
import zhDrawer from './resources/zh-CN/drawer.json'
import zhReview from './resources/zh-CN/review.json'
import zhSettings from './resources/zh-CN/settings.json'
import zhDomain from './resources/zh-CN/domain.json'
import zhErrors from './resources/zh-CN/errors.json'
import zhDetail from './resources/zh-CN/detail.json'
import zhItemDetail from './resources/zh-CN/itemDetail.json'
import zhOnboarding from './resources/zh-CN/onboarding.json'

export const defaultNS = 'common' as const
export const localeStorageKey = 'oratorio.ui.locale'

export const supportedLocales = [
  { value: 'en', label: 'English' },
  { value: 'zh-CN', label: '简体中文' },
] as const

export type AppLocale = (typeof supportedLocales)[number]['value']

export const resources = {
  en: {
    common: enCommon,
    board: enBoard,
    drawer: enDrawer,
    review: enReview,
    settings: enSettings,
    domain: enDomain,
    errors: enErrors,
    detail: enDetail,
    itemDetail: enItemDetail,
    onboarding: enOnboarding,
  },
  'zh-CN': {
    common: zhCommon,
    board: zhBoard,
    drawer: zhDrawer,
    review: zhReview,
    settings: zhSettings,
    domain: zhDomain,
    errors: zhErrors,
    detail: zhDetail,
    itemDetail: zhItemDetail,
    onboarding: zhOnboarding,
  },
} as const

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: ['en', 'zh-CN'],
    defaultNS,
    ns: ['common', 'board', 'drawer', 'review', 'settings', 'domain', 'errors', 'detail', 'itemDetail', 'onboarding'],
    interpolation: { escapeValue: false },
    returnNull: false,
    detection: {
      // Default to English: only honour an explicit, previously persisted choice.
      order: ['localStorage'],
      lookupLocalStorage: localeStorageKey,
      caches: ['localStorage'],
    },
  })

export function changeLocale(locale: AppLocale): void {
  void i18n.changeLanguage(locale)
}

/** Maps the active app locale to a BCP-47 tag for Intl date/number formatting. */
export function activeIntlLocale(): string {
  return i18n.language || 'en'
}

export default i18n
