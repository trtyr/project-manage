import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Skeleton } from 'antd'
import {
  PlusOutlined,
  FolderOutlined,
  MessageOutlined,
  FileOutlined,
  RightOutlined,
} from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { clientsApi, projectsApi, communicationsApi, filesApi } from '../api'
import ProjectRow from '../components/ProjectRow'
import EmptyState from '../components/ui/EmptyState'
import StatTile from '../components/ui/StatTile'

/** 总览仪表盘：全局统计 + 进行中项目 + 最近动态。项目数据本身
 *  （创建/编辑/筛选）在「项目」页；这里只做汇总与快速入口。 */
export default function DashboardPage() {
  const navigate = useNavigate()

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
  })

  const { data: clients } = useQuery({
    queryKey: ['clients'],
    queryFn: clientsApi.list,
  })

  const { data: recentComms } = useQuery({
    queryKey: ['communications-recent'],
    queryFn: () => communicationsApi.listRecent(5),
  })

  const { data: files } = useQuery({
    queryKey: ['files-all'],
    queryFn: filesApi.listAll,
  })

  const clientMap = useMemo(
    () => new Map(clients?.map((c) => [c.id, c.name])),
    [clients],
  )

  const inProgress = projects?.filter((p) => p.status === 'in_progress') ?? []
  const completed =
    projects?.filter((p) => p.status === 'completed').length ?? 0
  const paused = projects?.filter((p) => p.status === 'paused').length ?? 0

  const inProgressSorted = [...inProgress].sort(
    (a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  )

  const recentFiles = useMemo(
    () =>
      [...(files ?? [])]
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
        .slice(0, 5),
    [files],
  )

  const goCreate = () => navigate('/projects?create=1')

  // Zero projects: one centered onboarding state, no half-empty columns.
  if (!isLoading && projects?.length === 0) {
    return (
      <div
        style={{
          minHeight: '64vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <EmptyState
          icon={<FolderOutlined />}
          title="开始你的第一个项目"
          desc="创建项目后，客户、沟通记录、任务和文件都会集中在这里。"
          action={
            <Button type="primary" icon={<PlusOutlined />} onClick={goCreate}>
              创建第一个项目
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-header__title">总览</h1>
          <div className="page-header__sub">
            {projects?.length ?? 0} 个项目 · {inProgressSorted.length} 个进行中
          </div>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={goCreate}>
          新建项目
        </Button>
      </div>

      {/* Stats */}
      <div className="stat-grid">
        <StatTile
          label="进行中"
          value={inProgressSorted.length}
          dot="var(--blue)"
        />
        <StatTile label="已完成" value={completed} dot="var(--green)" />
        <StatTile label="已暂停" value={paused} dot="var(--amber)" />
        <StatTile label="资料" value={files?.length ?? 0} dot="var(--teal)" />
      </div>

      {/* Two-column: in-progress projects + activity feed */}
      {/* flexWrap + minWidth floor: on narrow windows the activity sidebar
          wraps below instead of crushing the project list. */}
      {isLoading ? (
        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <Skeleton active paragraph={{ rows: 6 }} />
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-6)',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
          }}
        >
          {/* In-progress projects */}
          <div style={{ flex: '1 1 60%', minWidth: 320 }}>
            <div className="section-label">
              进行中的项目
              <span className="section-label__count">
                {inProgressSorted.length}
              </span>
            </div>
            {inProgressSorted.length ? (
              <div className="card row-list">
                {inProgressSorted.map((p) => (
                  <ProjectRow
                    key={p.id}
                    project={p}
                    clientName={clientMap.get(p.client_id) ?? '未知客户'}
                    onClick={() => navigate(`/projects/${p.id}`)}
                  />
                ))}
              </div>
            ) : (
              <div className="card">
                <EmptyState
                  icon={<FolderOutlined />}
                  title="没有进行中的项目"
                  desc="从已完成或已暂停的项目继续，或者新建一个。"
                  action={
                    <Button onClick={() => navigate('/projects')}>
                      查看全部项目 <RightOutlined />
                    </Button>
                  }
                />
              </div>
            )}
          </div>

          {/* Activity column */}
          <div style={{ flex: '0 0 320px' }}>
            {recentComms?.length ? (
              <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
                <div className="card__header">
                  <MessageOutlined style={{ color: 'var(--ink-3)' }} />
                  最近沟通
                </div>
                <div className="row-list">
                  {recentComms.map((c) => (
                    <div
                      key={c.id}
                      className="recent-item"
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        navigate(
                          `/projects/${c.project_id}/communications/${c.id}`,
                        )
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter')
                          navigate(
                            `/projects/${c.project_id}/communications/${c.id}`,
                          )
                      }}
                    >
                      <span className="recent-item__date">
                        {dayjs(c.occurred_at).format('MM-DD')}
                      </span>
                      <span className="recent-item__project">
                        {c.project_name}
                      </span>
                      <span className="recent-item__preview">
                        {c.content.replace(/[#*`>\-]/g, '').substring(0, 60)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {recentFiles.length ? (
              <div className="card">
                <div className="card__header">
                  <FileOutlined style={{ color: 'var(--ink-3)' }} />
                  最近上传
                </div>
                <div className="row-list">
                  {recentFiles.map((f) => (
                    <div
                      key={f.id}
                      className="recent-item"
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/projects/${f.project_id}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter')
                          navigate(`/projects/${f.project_id}`)
                      }}
                    >
                      <span className="recent-item__date">
                        {dayjs(f.created_at).format('MM-DD')}
                      </span>
                      <span className="recent-item__preview">
                        {f.original_name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
