import { join } from 'path'
import { describe, expect, it } from 'vitest'
import {
  resolveDesktopConfigPath,
  resolveDesktopPreferencesPath,
  resolveDesktopSettingsRoot,
  type DesktopPathApp,
} from './desktopPaths'

describe('desktop paths', () => {
  it('stores editable desktop settings under the user home .oratorio directory', () => {
    const home = join('C:', 'Users', 'Operator')
    const app: DesktopPathApp = {
      getPath(name) {
        if (name !== 'home') {
          throw new Error(`Unexpected path request: ${name}`)
        }

        return home
      },
    }

    expect(resolveDesktopSettingsRoot(app)).toBe(join(home, '.oratorio'))
    expect(resolveDesktopConfigPath(app)).toBe(join(home, '.oratorio', 'config.json'))
    expect(resolveDesktopPreferencesPath(app)).toBe(join(home, '.oratorio', 'preferences.json'))
  })
})
