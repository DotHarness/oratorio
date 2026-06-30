import http from 'http'
import net from 'net'
import { afterEach, describe, expect, it } from 'vitest'
import { SshTunnelManager, resolveLocalPort } from './SshTunnelManager'
import type { OratorioSshTunnelPreferences } from '../shared/desktopConnection'

const servers: Array<http.Server | net.Server> = []

afterEach(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))))
  servers.length = 0
})

describe('SshTunnelManager', () => {
  it('reuses a preferred port when it already serves a healthy Oratorio backend', async () => {
    const port = await listenHttp((request, response) => {
      if (request.url === '/health') {
        response.setHeader('content-type', 'application/json')
        response.end(JSON.stringify({ service: 'oratorio', status: 'ok' }))
        return
      }
      response.statusCode = 404
      response.end()
    })

    const status = await new SshTunnelManager('ssh-not-needed').open(tunnelPreferences(port))

    expect(status).toMatchObject({
      state: 'running',
      localPort: port,
      localUrl: `http://127.0.0.1:${port}`,
      owned: false
    })
  })

  it('allocates a new local port when the preferred port is occupied by something else', async () => {
    const occupiedPort = await listenTcp()

    await expect(resolveLocalPort(occupiedPort)).resolves.not.toBe(occupiedPort)
  })
})

function tunnelPreferences(port: number): OratorioSshTunnelPreferences {
  return {
    sshTarget: 'oratorio-remote',
    identityFile: null,
    remoteHost: '127.0.0.1',
    remotePort: 5087,
    preferredLocalPort: port,
    autoStart: true
  }
}

function listenHttp(handler: http.RequestListener): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler)
    servers.push(server)
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (typeof address === 'object' && address?.port) {
        resolve(address.port)
      } else {
        reject(new Error('HTTP server did not expose a port.'))
      }
    })
  })
}

function listenTcp(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    servers.push(server)
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (typeof address === 'object' && address?.port) {
        resolve(address.port)
      } else {
        reject(new Error('TCP server did not expose a port.'))
      }
    })
  })
}
