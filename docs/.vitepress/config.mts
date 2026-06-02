import { defineConfig, type DefaultTheme } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'
import { withIcon } from './theme/icons'

const repo = 'https://github.com/DotHarness/oratorio'
const base = process.env.VITEPRESS_BASE ?? (process.env.GITHUB_ACTIONS ? '/oratorio/' : '/')

function escapeMustaches(value: string): string {
  return value.replaceAll('{{', '&#123;&#123;').replaceAll('}}', '&#125;&#125;')
}

const enSidebar: DefaultTheme.Sidebar = [
  {
    text: 'Overview',
    items: [
      { text: withIcon('diamond', 'What is Oratorio'), link: '/' },
      { text: withIcon('play', 'Getting Started'), link: '/getting-started' }
    ]
  },
  {
    text: 'Configure',
    items: [
      { text: withIcon('workspace', 'Connect to DotCraft'), link: '/dotcraft-workspaces' },
      { text: withIcon('github', 'GitHub Integration'), link: '/github' },
      { text: withIcon('gitlab', 'GitLab Integration'), link: '/gitlab' }
    ]
  },
  {
    text: 'Deploy',
    items: [
      { text: withIcon('server', 'Server Deployment'), link: '/server-deployment' }
    ]
  },
  {
    text: 'Reference',
    items: [
      { text: withIcon('cog', 'Configuration Reference'), link: '/configuration' },
      { text: withIcon('matrix', 'Local Support Matrix'), link: '/local-support' },
      { text: withIcon('hammer', 'Development'), link: '/development' },
      { text: withIcon('tag', 'GitHub Releases'), link: 'https://github.com/DotHarness/oratorio/releases' }
    ]
  }
]

const zhSidebar: DefaultTheme.Sidebar = [
  {
    text: '总览',
    items: [
      { text: withIcon('diamond', 'Oratorio 是什么'), link: '/zh/' },
      { text: withIcon('play', '快速开始'), link: '/zh/getting-started' }
    ]
  },
  {
    text: '配置',
    items: [
      { text: withIcon('workspace', '接入 DotCraft'), link: '/zh/dotcraft-workspaces' },
      { text: withIcon('github', 'GitHub 集成'), link: '/zh/github' },
      { text: withIcon('gitlab', 'GitLab 集成'), link: '/zh/gitlab' }
    ]
  },
  {
    text: '部署',
    items: [
      { text: withIcon('server', '服务器部署'), link: '/zh/server-deployment' }
    ]
  },
  {
    text: '参考',
    items: [
      { text: withIcon('cog', '配置参考'), link: '/zh/configuration' },
      { text: withIcon('matrix', '本地能力矩阵'), link: '/zh/local-support' },
      { text: withIcon('hammer', '开发指南'), link: '/zh/development' },
      { text: withIcon('tag', 'GitHub Releases'), link: 'https://github.com/DotHarness/oratorio/releases' }
    ]
  }
]

const enNav: DefaultTheme.NavItem[] = [
  { text: 'Overview', link: '/' },
  { text: 'Getting Started', link: '/getting-started' },
  { text: 'Configure', link: '/dotcraft-workspaces' },
  { text: 'Reference', link: '/configuration' }
]

const zhNav: DefaultTheme.NavItem[] = [
  { text: '总览', link: '/zh/' },
  { text: '快速开始', link: '/zh/getting-started' },
  { text: '配置', link: '/zh/dotcraft-workspaces' },
  { text: '参考', link: '/zh/configuration' }
]

export default withMermaid(defineConfig({
  title: 'Oratorio',
  description: 'A project board for your AI agents. Powered by DotCraft.',
  base,
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ['meta', { name: 'theme-color', content: '#2563eb' }],
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}oratorio-logo.svg` }]
  ],
  markdown: {
    image: { lazyLoading: true },
    config(md) {
      const defaultFence = md.renderer.rules.fence
      const defaultCodeBlock = md.renderer.rules.code_block

      md.renderer.rules.text = (tokens, idx) =>
        escapeMustaches(md.utils.escapeHtml(tokens[idx].content))

      md.renderer.rules.code_inline = (tokens, idx) =>
        `<code>${escapeMustaches(md.utils.escapeHtml(tokens[idx].content))}</code>`

      md.renderer.rules.fence = (tokens, idx, options, env, self) =>
        escapeMustaches(
          defaultFence
            ? defaultFence(tokens, idx, options, env, self)
            : self.renderToken(tokens, idx, options)
        )

      md.renderer.rules.code_block = (tokens, idx, options, env, self) =>
        escapeMustaches(
          defaultCodeBlock
            ? defaultCodeBlock(tokens, idx, options, env, self)
            : `<pre><code>${md.utils.escapeHtml(tokens[idx].content)}</code></pre>\n`
        )
    }
  },
  themeConfig: {
    logo: '/oratorio-logo.svg',
    siteTitle: 'Oratorio',
    search: { provider: 'local' },
    socialLinks: [{ icon: 'github', link: repo }],
    editLink: {
      pattern: `${repo}/edit/master/docs/:path`,
      text: 'Edit this page on GitHub'
    },
    footer: {
      message: 'Apache License 2.0',
      copyright: 'Copyright © DotHarness'
    }
  },
  locales: {
    root: {
      label: 'English',
      lang: 'en-US',
      title: 'Oratorio',
      description: 'A project board for your AI agents. Powered by DotCraft.',
      themeConfig: {
        nav: enNav,
        sidebar: enSidebar,
        outline: { label: 'On this page' },
        editLink: {
          pattern: `${repo}/edit/master/docs/:path`,
          text: 'Edit this page on GitHub'
        }
      }
    },
    zh: {
      label: '简体中文',
      lang: 'zh-CN',
      title: 'Oratorio',
      description: '给 AI agent 用的项目看板。由 DotCraft 驱动。',
      themeConfig: {
        nav: zhNav,
        sidebar: zhSidebar,
        outline: { label: '本页目录' },
        docFooter: { prev: '上一页', next: '下一页' },
        lastUpdated: { text: '最后更新' },
        langMenuLabel: '语言',
        returnToTopLabel: '回到顶部',
        sidebarMenuLabel: '菜单',
        darkModeSwitchLabel: '外观',
        lightModeSwitchTitle: '切换到浅色模式',
        darkModeSwitchTitle: '切换到深色模式'
      }
    }
  }
}))
