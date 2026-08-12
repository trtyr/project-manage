import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Modal,
  Form,
  Input,
  Select,
  Radio,
  Empty,
  App,
  Dropdown,
} from 'antd'
import { PlusOutlined, SearchOutlined, MoreOutlined } from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { clientsApi, projectsApi, communicationsApi } from '../api'
import type { Project, ProjectStatus, CommunicationWithProject } from '../types'

const statusOrder: Record<ProjectStatus, number> = {
  in_progress: 0,
  paused: 1,
  completed: 2,
}

const statusDot: Record<ProjectStatus, string> = {
  in_progress: 'status-dot--in_progress',
  completed: 'status-dot--completed',
  paused: 'status-dot--paused',
}

export default function ProjectBoard() {
  const navigate = useNavigate()
  const { message, modal } = App.useApp()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [form] = Form.useForm()
  const [clientMode, setClientMode] = useState<'existing' | 'new'>('existing')
  const [searchText, setSearchText] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [editTarget, setEditTarget] = useState<Project | null>(null)
  const [editForm] = Form.useForm()

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText.trim()), 300)
    return () => clearTimeout(timer)
  }, [searchText])

  const isSearching = debouncedSearch.length > 0

  // --- Queries ---
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
    enabled: !isSearching,
  })

  const { data: searchResults } = useQuery({
    queryKey: ['communications-search', debouncedSearch],
    queryFn: () => communicationsApi.search(debouncedSearch),
    enabled: isSearching,
  })

  // --- Mutations ---
  const createProjectMut = useMutation({
    mutationFn: projectsApi.create,
    onSuccess: (p) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      message.success(`项目「${p.name}」已创建`)
      setCreateOpen(false)
      form.resetFields()
      setClientMode('existing')
    },
    onError: () => message.error('创建失败，请重试'),
  })

  const createClientMut = useMutation({
    mutationFn: clientsApi.create,
  })

  const updateProjectMut = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string
      data: Parameters<typeof projectsApi.update>[1]
    }) => projectsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      message.success('项目已更新')
      setEditTarget(null)
    },
    onError: () => message.error('更新失败，请重试'),
  })

  const deleteProjectMut = useMutation({
    mutationFn: projectsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      message.success('项目已删除')
    },
    onError: () => message.error('删除失败，请重试'),
  })

  const clientMap = new Map(clients?.map((c) => [c.id, c.name]))

  const getMenuItems = (p: Project): MenuProps['items'] => [
    {
      key: 'edit',
      label: '编辑项目',
      onClick: () => {
        setEditTarget(p)
        editForm.setFieldsValue({
          name: p.name,
          status: p.status,
          phase: p.phase,
          goals: (p.goals ?? []).join('\n'),
        })
      },
    },
    { type: 'divider' },
    {
      key: 'delete',
      label: '删除项目',
      danger: true,
      onClick: () => {
        modal.confirm({
          title: `删除项目「${p.name}」？`,
          content: '所有沟通记录、任务、文件、阶段等数据将一并删除，不可恢复。',
          okText: '确认删除',
          okType: 'danger',
          cancelText: '取消',
          onOk: () => deleteProjectMut.mutate(p.id),
        })
      },
    },
  ]

  const handleCreate = async () => {
    const v = await form.validateFields()
    const goals = v.goals?.split('\n').filter(Boolean) ?? []

    let clientId = v.client_id

    if (clientMode === 'new') {
      try {
        const client = await createClientMut.mutateAsync({
          name: v.new_client_name,
          contact_person: v.new_contact_person,
          contact_info: v.new_contact_info,
        })
        clientId = client.id
        queryClient.invalidateQueries({ queryKey: ['clients'] })
      } catch {
        message.error('客户创建失败，请重试')
        return
      }
    }

    if (!clientId) {
      message.error('请选择或新建客户')
      return
    }

    createProjectMut.mutate({
      client_id: clientId,
      name: v.name,
      status: v.status ?? 'in_progress',
      phase: v.phase,
      goals,
    })
  }

  // --- Sorted projects ---
  const sortedProjects = [...(projects ?? [])].sort((a, b) => {
    const so = statusOrder[a.status] - statusOrder[b.status]
    if (so !== 0) return so
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  })

  const filteredProjects = isSearching
    ? sortedProjects.filter(
        (p) =>
          p.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
          p.competitors.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
          (clientMap.get(p.client_id) ?? '')
            .toLowerCase()
            .includes(debouncedSearch.toLowerCase()),
      )
    : sortedProjects

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div className="page-header__left">
          <h1 className="page-header__title">项目</h1>
          <span className="page-header__count">{projects?.length ?? 0} 个</span>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setCreateOpen(true)}
        >
          新建项目
        </Button>
      </div>

      {/* Search */}
      <Input
        size="large"
        placeholder="搜索项目、竞品或沟通记录…"
        prefix={<SearchOutlined style={{ color: 'var(--muted-hex)' }} />}
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        allowClear
        style={{ marginBottom: 24, borderRadius: 8, maxWidth: 420 }}
      />

      {/* === Search mode === */}
      {isSearching ? (
        <div>
          {/* Matched projects */}
          <div className="search-results__group">
            <div className="search-results__label">
              项目（{filteredProjects.length}）
            </div>
            {filteredProjects.length ? (
              <div className="project-list">
                {filteredProjects.map((p) => (
                  <ProjectRow
                    key={p.id}
                    project={p}
                    clientName={clientMap.get(p.client_id) ?? '未知客户'}
                    onClick={() => navigate(`/projects/${p.id}`)}
                    menuItems={getMenuItems(p)}
                  />
                ))}
              </div>
            ) : (
              <div style={{ color: 'var(--muted-hex)', fontSize: 13 }}>
                没有匹配的项目
              </div>
            )}
          </div>

          {/* Matched communications */}
          <div className="search-results__group">
            <div className="search-results__label">
              沟通记录（{searchResults?.length ?? 0}）
            </div>
            {searchResults?.length ? (
              <div>
                {searchResults.map((c) => (
                  <SearchResultCard key={c.id} item={c} />
                ))}
              </div>
            ) : (
              <div style={{ color: 'var(--muted-hex)', fontSize: 13 }}>
                没有匹配的沟通记录
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* === Project list === */}
          {isLoading ? (
            <div style={{ color: 'var(--muted-hex)', fontSize: 14 }}>
              加载中…
            </div>
          ) : !projects?.length ? (
            <Empty
              description="还没有项目"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            >
              <Button type="primary" onClick={() => setCreateOpen(true)}>
                创建第一个项目
              </Button>
            </Empty>
          ) : (
            <div className="project-list">
              {filteredProjects.map((p) => (
                <ProjectRow
                  key={p.id}
                  project={p}
                  clientName={clientMap.get(p.client_id) ?? '未知客户'}
                  onClick={() => navigate(`/projects/${p.id}`)}
                  menuItems={getMenuItems(p)}
                />
              ))}
            </div>
          )}

          {/* === Recent activity === */}
          {recentComms?.length ? (
            <div className="recent-section">
              <div className="recent-section__label">最近活动</div>
              {recentComms.map((c) => (
                <div
                  key={c.id}
                  className="recent-item"
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    navigate(`/projects/${c.project_id}/communications/${c.id}`)
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter')
                      navigate(
                        `/projects/${c.project_id}/communications/${c.id}`,
                      )
                  }}
                >
                  <span className="recent-item__date">
                    {dayjs(c.occurred_at).format('M月D日')}
                  </span>
                  <span className="recent-item__project">{c.project_name}</span>
                  <span className="recent-item__preview">
                    {c.content.replace(/[#*`>\-]/g, '').substring(0, 80)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}

      {/* Create project modal */}
      <Modal
        title="新建项目"
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false)
          setClientMode('existing')
        }}
        onOk={handleCreate}
        confirmLoading={createProjectMut.isPending || createClientMut.isPending}
        width={520}
        okText="创建"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="关联客户" required>
            <Radio.Group
              value={clientMode}
              onChange={(e) => setClientMode(e.target.value)}
              style={{ marginBottom: 12 }}
            >
              <Radio.Button value="existing">选择已有客户</Radio.Button>
              <Radio.Button value="new">新建客户</Radio.Button>
            </Radio.Group>

            {clientMode === 'existing' ? (
              <Form.Item
                name="client_id"
                noStyle
                rules={[{ required: true, message: '请选择客户' }]}
              >
                <Select
                  placeholder="选择客户"
                  options={clients?.map((c) => ({
                    label: c.name,
                    value: c.id,
                  }))}
                  showSearch
                  optionFilterProp="label"
                  notFoundContent="暂无客户，请切换到「新建客户」"
                />
              </Form.Item>
            ) : (
              <>
                <Form.Item
                  name="new_client_name"
                  rules={[{ required: true, message: '请输入客户名称' }]}
                >
                  <Input placeholder="客户名称" />
                </Form.Item>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '0 12px',
                  }}
                >
                  <Form.Item name="new_contact_person">
                    <Input placeholder="联系人" />
                  </Form.Item>
                  <Form.Item name="new_contact_info">
                    <Input placeholder="联系方式" />
                  </Form.Item>
                </div>
              </>
            )}
          </Form.Item>

          <Form.Item
            name="name"
            label="项目名称"
            rules={[{ required: true, message: '请输入项目名称' }]}
          >
            <Input placeholder="如：Web 应用软件测试" />
          </Form.Item>
          <Form.Item name="status" label="状态" initialValue="in_progress">
            <Select
              options={[
                { label: '进行中', value: 'in_progress' },
                { label: '已完成', value: 'completed' },
                { label: '已暂停', value: 'paused' },
              ]}
            />
          </Form.Item>
          <Form.Item name="phase" label="当前阶段">
            <Input placeholder="如：信息收集" />
          </Form.Item>
          <Form.Item name="goals" label="项目目标" extra="每行一个目标">
            <Input.TextArea
              rows={3}
              placeholder={'如：发现安全漏洞\n提供修复建议'}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit project modal */}
      <Modal
        title="编辑项目"
        open={!!editTarget}
        onCancel={() => setEditTarget(null)}
        onOk={() =>
          editForm.validateFields().then((v) => {
            if (!editTarget) return
            const goals = v.goals?.split('\n').filter(Boolean) ?? []
            updateProjectMut.mutate({
              id: editTarget.id,
              data: {
                name: v.name,
                status: v.status,
                phase: v.phase,
                goals,
              },
            })
          })
        }
        confirmLoading={updateProjectMut.isPending}
        width={480}
        okText="保存"
        cancelText="取消"
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="项目名称"
            rules={[{ required: true, message: '请输入项目名称' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select
              options={[
                { label: '进行中', value: 'in_progress' },
                { label: '已完成', value: 'completed' },
                { label: '已暂停', value: 'paused' },
              ]}
            />
          </Form.Item>
          <Form.Item name="phase" label="当前阶段">
            <Input placeholder="如：信息收集" />
          </Form.Item>
          <Form.Item name="goals" label="项目目标" extra="每行一个目标">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

// --- Project row ---

function ProjectRow({
  project,
  clientName,
  onClick,
  menuItems,
}: {
  project: Project
  clientName: string
  onClick: () => void
  menuItems?: MenuProps['items']
}) {
  return (
    <div
      className="project-row"
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onClick()
      }}
    >
      <div className={`status-dot ${statusDot[project.status]}`} />
      <div className="project-row__body">
        <div className="project-row__name">{project.name}</div>
        <div className="project-row__meta">
          {clientName}
          {project.phase && (
            <>
              <span className="project-row__meta-sep">·</span>
              {project.phase}
            </>
          )}
        </div>
      </div>
      {menuItems && (
        <Dropdown menu={{ items: menuItems }} trigger={['click']}>
          <button
            type="button"
            className="project-row__more"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            aria-label="更多操作"
          >
            <MoreOutlined />
          </button>
        </Dropdown>
      )}
    </div>
  )
}

// --- Search result card (communication) ---

function SearchResultCard({ item }: { item: CommunicationWithProject }) {
  const navigate = useNavigate()
  const participants = (item.participants || '')
    .split(/[,，、;；]/)
    .map((s) => s.trim())
    .filter(Boolean)

  return (
    <div
      className="search-result-card"
      role="button"
      tabIndex={0}
      onClick={() =>
        navigate(`/projects/${item.project_id}/communications/${item.id}`)
      }
      onKeyDown={(e) => {
        if (e.key === 'Enter')
          navigate(`/projects/${item.project_id}/communications/${item.id}`)
      }}
    >
      <div className="search-result-card__head">
        <span style={{ fontSize: 13, color: 'var(--muted-hex)' }}>
          {dayjs(item.occurred_at).format('YYYY-MM-DD HH:mm')}
        </span>
        <span
          style={{
            fontSize: 12,
            color: 'var(--primary-hex)',
          }}
        >
          {item.project_name}
        </span>
        {participants.map((p) => (
          <span
            key={p}
            style={{
              fontSize: 12,
              color: 'var(--muted-hex)',
            }}
          >
            {p}
          </span>
        ))}
      </div>
      <div style={{ fontSize: 14, color: 'var(--muted-hex)' }}>
        {item.content.replace(/[#*`>\-]/g, '').substring(0, 200)}
        {item.content.length > 200 && '…'}
      </div>
    </div>
  )
}
