import { useState, useEffect, useMemo, useRef, Component } from 'react'
import {
  ConfigProvider,
  Input,
  Button,
  Dropdown,
  Spin,
  App as AntApp,
} from 'antd'
import type { InputRef } from 'antd'
import type { MenuProps } from 'antd'
import {
  SearchOutlined,
  LogoutOutlined,
  KeyOutlined,
  FolderOutlined,
  DatabaseOutlined,
  SafetyCertificateOutlined,
  SunOutlined,
  MoonOutlined,
} from '@ant-design/icons'
import zhCN from 'antd/locale/zh_CN'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { lightTheme, darkTheme } from './theme'
import { registerMutationErrorToast } from './mutationToast'
import { projectsApi, searchApi, authApi } from './api'
import Avatar from './components/ui/Avatar'
import ProjectBoard from './pages/ProjectBoard'
import ProjectDetail from './pages/ProjectDetail'
import CommunicationDetail from './pages/CommunicationDetail'
import FileLibrary from './pages/FileLibrary'
import LoginPage from './pages/LoginPage'
import SetupPage from './pages/SetupPage'
import BackupPage from './pages/BackupPage'
import ChangePasswordModal from './components/ChangePasswordModal'

const navItems = [
  { path: '/', label: '项目', icon: FolderOutlined },
  { path: '/files', label: '资料库', icon: DatabaseOutlined },
  { path: '/backup', label: '备份', icon: SafetyCertificateOutlined },
] as const

const HIT_RESOURCE_LABEL: Record<string, string> = {
  project: '项目',
  client: '客户',
  communication: '沟通',
  task: '任务',
  issue: '关切',
  finding: '发现',
  person: '人员',
  asset: '资产',
  deliverable: '交付物',
  file: '文件',
}

function SidebarItem({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <div
      className={`sidebar-item${active ? ' sidebar-item--active' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
    >
      <span className="sidebar-item__icon">{icon}</span>
      <span>{label}</span>
    </div>
  )
}

class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true }
  }

  componentDidCatch(
    error: Error,
    errorInfo: { componentStack?: string },
  ): void {
    // Surface the failure for the console / external loggers.
    // The fallback UI is rendered from `state.hasError`; we keep the raw
    // error out of state to avoid leaking sensitive details into React DevTools.
    console.error('App ErrorBoundary caught:', error, errorInfo)
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '60vh',
            padding: 24,
            gap: 16,
            textAlign: 'center',
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18, color: 'var(--ink)' }}>
            页面出错了
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)' }}>
            出现了意外的错误，请刷新页面重试。
          </p>
          <Button type="primary" onClick={this.handleReload}>
            刷新页面
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}

/**
 * B10: registers the theme-aware antd message API into main.tsx's
 * mutation-error boundary so every failed mutation shows a classified
 * toast without per-component onError handlers.
 */
function MutationToastBridge() {
  const { message } = AntApp.useApp()
  useEffect(() => {
    registerMutationErrorToast((msg) => message.error(msg))
    return () => {
      // fall back to nothing on unmount (StrictMode double-mount safe:
      // the second mount re-registers immediately)
      registerMutationErrorToast(() => undefined)
    }
  }, [message])
  return null
}

function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()

  // --- Auth bootstrap: needs_setup → /setup; not logged in → /login.
  // The 401 interceptor in api/index.ts also bounces to /login when a
  // business call loses its session, so this gate is the fast path only.
  const isAuthPage =
    location.pathname === '/login' || location.pathname === '/setup'
  const { data: authStatus, isLoading: authLoading } = useQuery({
    queryKey: ['auth-status'],
    queryFn: authApi.status,
    staleTime: 60_000,
  })
  const {
    data: me,
    isLoading: meLoading,
    isError: meRejected,
  } = useQuery({
    queryKey: ['auth-me'],
    queryFn: authApi.me,
    enabled: !authStatus?.needs_setup,
    retry: false,
  })

  useEffect(() => {
    if (authLoading || !authStatus) return
    if (authStatus.needs_setup && location.pathname !== '/setup') {
      // Empty users table — bootstrap the first account.
      navigate('/setup', { replace: true })
    } else if (!authStatus.needs_setup && meRejected && !isAuthPage) {
      // /me settled as 401 and we're not on an auth page → logged out.
      navigate('/login', { replace: true })
    }
  }, [
    authStatus,
    authLoading,
    meRejected,
    location.pathname,
    navigate,
    isAuthPage,
  ])

  const handleLogout = async () => {
    await authApi.logout().catch(() => undefined)
    queryClient.clear()
    navigate('/login', { replace: true })
  }

  const [passwordOpen, setPasswordOpen] = useState(false)

  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme')
    if (saved) return saved === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  const [searchText, setSearchText] = useState('')
  const [searchHits, setSearchHits] = useState<
    Awaited<ReturnType<typeof searchApi.search>>
  >([])
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<InputRef>(null)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  }, [isDark])

  useEffect(() => {
    if (!searchText.trim()) {
      setSearchHits([])
      setSearchOpen(false)
      return
    }
    const timer = setTimeout(async () => {
      const hits = await searchApi.search(searchText).catch(() => [])
      setSearchHits(hits)
      setSearchOpen(true)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchText])

  // Ctrl/⌘+K focuses the topbar search — Vercel-style command bar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const handleSearchClick = (
    hit: Awaited<ReturnType<typeof searchApi.search>>[number],
  ) => {
    setSearchOpen(false)
    setSearchText('')
    if (hit.resource === 'project') {
      navigate(`/projects/${hit.id}`)
    } else if (hit.project_id) {
      navigate(`/projects/${hit.project_id}`)
    }
  }

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
    // Sidebar metric / breadcrumb only — never fire before login, otherwise
    // the 401 interceptor full-page-reloads into a refresh loop on /login
    // & /setup.
    enabled: !!me,
  })

  const isActive = (path: string) =>
    path === '/'
      ? location.pathname === '/'
      : location.pathname.startsWith(path)

  const inProgress =
    projects?.filter((p) => p.status === 'in_progress').length ?? 0

  // --- Breadcrumbs: section / entity / sub-page -----------------------
  const crumbs = useMemo(() => {
    const parts = location.pathname.split('/').filter(Boolean)
    if (parts[0] !== 'projects') {
      const section = navItems.find(
        (n) => n.path === (location.pathname === '/' ? '/' : `/${parts[0]}`),
      )
      return [{ label: section?.label ?? '项目', current: true }]
    }
    const project = projects?.find((p) => p.id === parts[1])
    const items: { label: string; current?: boolean; to?: string }[] = [
      { label: '项目', to: '/' },
    ]
    if (parts[1]) {
      items.push(
        parts[2]
          ? { label: project?.name ?? '…', to: `/projects/${parts[1]}` }
          : { label: project?.name ?? '…', current: true },
      )
    }
    if (parts[2] === 'communications') {
      items.push({ label: '沟通记录', current: true })
    }
    return items
  }, [location.pathname, projects])

  const displayName = me?.display_name ?? me?.username ?? ''

  const userMenu: MenuProps = {
    items: [
      {
        key: 'profile',
        label: (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '2px 0',
            }}
          >
            <Avatar name={displayName} />
            <span style={{ display: 'flex', flexDirection: 'column' }}>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--ink)',
                  lineHeight: 1.4,
                }}
              >
                {displayName || '未登录'}
              </span>
              {me?.username && (
                <span className="mono" style={{ color: 'var(--ink-3)' }}>
                  @{me.username}
                </span>
              )}
            </span>
          </div>
        ),
      },
      { type: 'divider' },
      { key: 'password', icon: <KeyOutlined />, label: '修改密码' },
      {
        key: 'theme',
        icon: isDark ? <SunOutlined /> : <MoonOutlined />,
        label: isDark ? '切换到浅色模式' : '切换到深色模式',
      },
      { type: 'divider' },
      { key: 'logout', icon: <LogoutOutlined />, label: '登出', danger: true },
    ],
    onClick: ({ key }) => {
      if (key === 'password') setPasswordOpen(true)
      else if (key === 'theme') setIsDark((d) => !d)
      else if (key === 'logout') void handleLogout()
    },
  }

  const UserMenuButton = ({ compact = false }: { compact?: boolean }) => (
    <Dropdown
      menu={userMenu}
      trigger={['click']}
      placement={compact ? 'bottomRight' : 'topRight'}
    >
      {compact ? (
        <button type="button" className="sidebar-user" aria-label="用户菜单">
          <Avatar name={displayName} />
        </button>
      ) : (
        <button
          type="button"
          className="sidebar-user"
          aria-label={`用户菜单（${displayName}）`}
        >
          <Avatar name={displayName} />
          <span className="sidebar-user__info">
            <span className="sidebar-user__name">
              {displayName || '未登录'}
            </span>
            <span className="sidebar-user__meta">
              {projects?.length ?? 0} 个项目 · {inProgress} 进行中
            </span>
          </span>
        </button>
      )}
    </Dropdown>
  )

  // Grouped search hits for the dropdown panel
  const groupedHits = useMemo(() => {
    const g: Record<string, typeof searchHits> = {}
    for (const h of searchHits) (g[h.resource] ??= []).push(h)
    return g
  }, [searchHits])

  // Auth pages render standalone (no sidebar); the 401 interceptor and
  // the bootstrap effect above handle redirects between them and the app.
  if (location.pathname === '/login') {
    return (
      <ConfigProvider locale={zhCN} theme={isDark ? darkTheme : lightTheme}>
        <LoginPage />
      </ConfigProvider>
    )
  }
  if (location.pathname === '/setup') {
    return (
      <ConfigProvider locale={zhCN} theme={isDark ? darkTheme : lightTheme}>
        <SetupPage />
      </ConfigProvider>
    )
  }

  // Auth gate: until bootstrap resolves (status → maybe /me), render a
  // bare spinner instead of the app shell — otherwise business pages mount
  // and fire queries that 401 while unauthenticated, causing full-page
  // bounces (and formerly a reload loop) via the axios interceptor.
  const authReady =
    !authLoading &&
    authStatus !== undefined &&
    (authStatus.needs_setup || !meLoading)
  if (!authReady) {
    return (
      <ConfigProvider locale={zhCN} theme={isDark ? darkTheme : lightTheme}>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Spin size="large" />
        </div>
      </ConfigProvider>
    )
  }

  return (
    <ConfigProvider locale={zhCN} theme={isDark ? darkTheme : lightTheme}>
      {/* B10: wires the antd message API into the global mutation-error
          boundary (must mount before any mutation can fail). */}
      <MutationToastBridge />
      <div className="app-shell">
        {/* Sidebar */}
        <aside className="app-sidebar">
          <div
            className="sidebar-logo"
            role="button"
            tabIndex={0}
            onClick={() => navigate('/')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                navigate('/')
              }
            }}
          >
            <span className="brand-mark" />
            <span className="sidebar-logo__text">项目管理</span>
          </div>

          <div className="sidebar-section-label">工作台</div>
          <nav className="sidebar-nav">
            {navItems.map((item) => (
              <SidebarItem
                key={item.path}
                active={isActive(item.path)}
                icon={<item.icon />}
                label={item.label}
                onClick={() => navigate(item.path)}
              />
            ))}
          </nav>

          <div className="sidebar-spacer" />

          <div className="sidebar-footer">
            <UserMenuButton />
          </div>
        </aside>

        {/* Main column: topbar + content */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <header className="topbar">
            <nav className="crumbs" aria-label="面包屑">
              {crumbs.map((c, i) => (
                <span
                  key={i}
                  style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  {i > 0 && <span className="crumbs__sep">/</span>}
                  {c.to ? (
                    <a
                      className="crumbs__item"
                      onClick={(e) => {
                        e.preventDefault()
                        navigate(c.to!)
                      }}
                      href={c.to}
                    >
                      {c.label}
                    </a>
                  ) : (
                    <span
                      className={`crumbs__item ${c.current ? 'crumbs__current' : ''}`}
                    >
                      {c.label}
                    </span>
                  )}
                </span>
              ))}
            </nav>

            <div className="topbar__spacer" />

            <div className="topbar-search">
              <Input
                ref={searchRef}
                size="small"
                placeholder="搜索…"
                prefix={<SearchOutlined style={{ color: 'var(--ink-3)' }} />}
                suffix={searchText ? null : <span className="kbd">Ctrl K</span>}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onFocus={() => searchText.trim() && setSearchOpen(true)}
                onBlur={() => setSearchOpen(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setSearchText('')
                    setSearchOpen(false)
                  }
                }}
                allowClear
              />
              {searchOpen && (
                <div
                  className="search-panel"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  {searchHits.length === 0 ? (
                    <div className="search-panel__empty">
                      没有找到与「{searchText}」相关的内容
                    </div>
                  ) : (
                    Object.entries(groupedHits).map(([resource, hits]) => (
                      <div key={resource}>
                        <div className="search-panel__group">
                          {HIT_RESOURCE_LABEL[resource] ?? resource}
                        </div>
                        {hits.map((hit) => (
                          <div
                            key={`${hit.resource}-${hit.id}`}
                            className="search-panel__item"
                            role="button"
                            tabIndex={0}
                            onClick={() => handleSearchClick(hit)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSearchClick(hit)
                            }}
                          >
                            <span className="search-panel__type">
                              {HIT_RESOURCE_LABEL[hit.resource] ?? hit.resource}
                            </span>
                            <span className="search-panel__title">
                              {hit.title}
                            </span>
                            {hit.subtitle && (
                              <span className="search-panel__subtitle">
                                {hit.subtitle}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <UserMenuButton compact />
          </header>

          {/* Content */}
          <main className="app-content">
            <div className="app-content__inner fade-in">
              <ErrorBoundary>
                <Routes>
                  <Route path="/" element={<ProjectBoard />} />
                  <Route path="/files" element={<FileLibrary />} />
                  <Route path="/backup" element={<BackupPage />} />
                  <Route path="/projects/:id" element={<ProjectDetail />} />
                  <Route
                    path="/projects/:id/communications/:commId"
                    element={<CommunicationDetail />}
                  />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/setup" element={<SetupPage />} />
                </Routes>
              </ErrorBoundary>
            </div>
          </main>
        </div>
      </div>

      <ChangePasswordModal
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
      />
    </ConfigProvider>
  )
}

export default App
