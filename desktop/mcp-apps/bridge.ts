import { App } from '@modelcontextprotocol/ext-apps'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

export interface OratorioAppCallbacks {
  onToolInput(argumentsValue: Record<string, unknown>): void
  onToolResult(result: CallToolResult): void
  onHostContext(context: { theme?: string }): void
}

export interface OratorioAppClient {
  callTool(name: string, args: Record<string, unknown>): Promise<CallToolResult>
  openLink(url: string): Promise<void>
}

export async function connectOratorioApp(callbacks: OratorioAppCallbacks): Promise<OratorioAppClient> {
  const app = new App({ name: 'oratorio', version: '1' })
  app.ontoolinput = params => callbacks.onToolInput(params.arguments ?? {})
  app.ontoolresult = result => callbacks.onToolResult(result)
  app.onhostcontextchanged = context => callbacks.onHostContext(context)
  await app.connect()
  callbacks.onHostContext(app.getHostContext() ?? {})
  return {
    callTool: (name, args) => app.callServerTool({ name, arguments: args }),
    openLink: async url => { await app.openLink({ url }) }
  }
}
