import { useState, useEffect, Component } from 'react'
import { ConfigProvider, Switch } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { FolderOutlined, DatabaseOutlined } from '@ant-design/icons'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { lightTheme, darkTheme } from './theme'
import { projectsApi } from './api'
import ProjectBoard from './pages/ProjectBoard'
import ProjectDetail from './pages/ProjectDetail'
import CommunicationDetail from './pages/CommunicationDetail'
import FileLibrary from './pages/FileLibrary'

const navItems = [
  { path: '/', label: '项目', icon: FolderOutlined },
  { path: '/files', label: '资料库', icon: DatabaseOutlined },
] as const

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

  componentDidCatch(error: Error, errorInfo: { componentStack?: string }): void {
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
          <h2 style={{ margin: 0, color: 'var(--ink)' }}>页面出错了</h2>
          <p style={{ margin: 0, color: 'var(--muted)' }}>
            出现了意外的错误，请刷新页面重试。
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              padding: '8px 20px',
              borderRadius: 6,
              border: '1px solid var(--line)',
              background: 'var(--surface)',
              color: 'var(--ink)',
              cursor: 'pointer',
            }}
          >
            刷新
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function App() {
  const navigate = useNavigate()
  const location = useLocation()

  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme')
    if (saved) return saved === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  }, [isDark])

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
  })

  const isActive = (path: string) =>
    path === '/'
      ? location.pathname === '/'
      : location.pathname.startsWith(path)

  const inProgress =
    projects?.filter((p) => p.status === 'in_progress').length ?? 0

  return (
    <ConfigProvider locale={zhCN} theme={isDark ? darkTheme : lightTheme}>
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
            <div className="sidebar-logo__dot" />
            <span className="sidebar-logo__text">sec-tracker</span>
          </div>

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
            <div className="sidebar-footer__stats">
              {projects?.length ?? 0} 个项目
              <br />
              {inProgress} 进行中
            </div>
            <div className="sidebar-footer__toggle">
              <Switch
                checked={isDark}
                onChange={setIsDark}
                checkedChildren="🌙"
                unCheckedChildren="☀️"
                size="small"
              />
            </div>
          </div>
        </aside>

        {/* Content */}
        <main className="app-content">
          <div className="app-content__inner fade-in">
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<ProjectBoard />} />
                <Route path="/files" element={<FileLibrary />} />
                <Route path="/projects/:id" element={<ProjectDetail />} />
                <Route
                  path="/projects/:id/communications/:commId"
                  element={<CommunicationDetail />}
                />
              </Routes>
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </ConfigProvider>
  )
}

export default App
