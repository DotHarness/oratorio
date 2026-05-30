import { describe, expect, it } from 'vitest'
import { resources } from '../index'

type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

function flattenKeys(value: Json, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [prefix]
  }

  return Object.entries(value).flatMap(([key, child]) =>
    flattenKeys(child as Json, prefix ? `${prefix}.${key}` : key),
  )
}

const locales = Object.keys(resources) as Array<keyof typeof resources>
const baseLocale = 'en'
const namespaces = Object.keys(resources[baseLocale]) as Array<keyof (typeof resources)['en']>

describe('i18n resource parity', () => {
  it('registers more than one locale', () => {
    expect(locales.length).toBeGreaterThan(1)
    expect(locales).toContain(baseLocale)
  })

  for (const locale of locales) {
    if (locale === baseLocale) continue

    for (const ns of namespaces) {
      it(`${String(locale)}/${String(ns)} has the same keys as ${baseLocale}`, () => {
        const expected = flattenKeys(resources[baseLocale][ns] as Json).sort()
        const actual = flattenKeys(resources[locale][ns] as Json).sort()

        const missing = expected.filter((key) => !actual.includes(key))
        const extra = actual.filter((key) => !expected.includes(key))

        expect({ missing, extra }).toEqual({ missing: [], extra: [] })
      })
    }
  }
})
