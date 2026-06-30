import { describe, expect, it } from 'vitest'
import {
  buildSshTunnelArgs,
  isValidIdentityFile,
  isValidSshTarget,
  normalizeSshTunnelPreferences
} from './desktopConnection'

describe('SSH tunnel connection helpers', () => {
  it('normalizes missing tunnel preferences to the documented defaults', () => {
    expect(normalizeSshTunnelPreferences(null)).toEqual({
      sshTarget: '',
      identityFile: null,
      remoteHost: '127.0.0.1',
      remotePort: 5087,
      preferredLocalPort: 5087,
      autoStart: true
    })
  })

  it('rejects ssh targets and identity files that could be parsed as options', () => {
    expect(isValidSshTarget('oratorio-remote')).toBe(true)
    expect(isValidSshTarget('deploy@oratorio.example.test')).toBe(true)
    expect(isValidSshTarget('-oProxyCommand=bad')).toBe(false)
    expect(isValidSshTarget('bad target')).toBe(false)

    expect(isValidIdentityFile('~/.ssh/id_ed25519')).toBe(true)
    expect(isValidIdentityFile('C:/Example/ssh/oratorio key.pem')).toBe(true)
    expect(isValidIdentityFile('-Fbad')).toBe(false)
    expect(isValidIdentityFile('bad\nkey')).toBe(false)
  })

  it('builds a loopback-only ssh -L argv vector', () => {
    expect(buildSshTunnelArgs({
      sshTarget: 'oratorio-remote',
      identityFile: '~/.ssh/id_ed25519',
      remoteHost: '127.0.0.1',
      remotePort: 5087,
      preferredLocalPort: 5087,
      autoStart: true
    }, 5099)).toEqual([
      '-N',
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=10',
      '-o',
      'StrictHostKeyChecking=accept-new',
      '-o',
      'ExitOnForwardFailure=yes',
      '-L',
      '127.0.0.1:5099:127.0.0.1:5087',
      '-i',
      '~/.ssh/id_ed25519',
      '-o',
      'IdentitiesOnly=yes',
      '--',
      'oratorio-remote'
    ])
  })
})
