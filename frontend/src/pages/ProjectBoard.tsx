import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Button,
  Modal,
  Form,
  Input,
  Select,
  Radio,
  App,
  Segmented,
  Skeleton,
} from 'antd'
import type { MenuProps } from 'antd'
import { PlusOutlined, SearchOutlined, FolderOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clientsApi, projectsApi } from '../api'
import type { Project } from '../types'
import ProjectRow from '../components/ProjectRow'
import EmptyState from '../components/ui/EmptyState'
import { PROJECT_STATUS_META } from '../utils/status'

/** D5: shared CRM options — same value set as ProjectDetail's edit modal. */
const TECH_APPROVAL_OPTIONS = [
  { label: '未接触', value: '未接触' },
  { label: 'POC中', value: 'POC中' },
  { label: '已认可', value: '已认可' },
  { label: '技术否决', value: '技术否决' },
]

const statusOrder: Record<string, number> = {
  in_progress: 0,
  paused: 1,
  completed: 2,
}

/** 项目页：只放项目。按状态分组列出全部项目，支持按名称/客户/阶段/
 * 竞争对手本地筛选；全局搜索由顶栏 Ctrl+K 命令栏承担。 */
export default function ProjectBoard() {
  const navigate = useNavigate()
  const { message, modal } = App.useApp()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [form] = Form.useForm()
  const [clientMode, setClientMode] = useState<'existing' | 'new'>('existing')
  const [filterText, setFilterText] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [editTarget, setEditTarget] = useState<Project | null>(null)
  const [editForm] = Form.useForm()

  // Dashboard's 新建项目 deep-links here with ?create=1.
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    if (searchParams.get('create') === '1') {
      setCreateOpen(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // --- Queries ---
  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
  })

  const { data: clients } = useQuery({
    queryKey: ['clients'],
    queryFn: clientsApi.list,
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
  })

  const deleteProjectMut = useMutation({
    mutationFn: projectsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      message.success('项目已删除')
    },
  })

  const clientMap = useMemo(
    () => new Map(clients?.map((c) => [c.id, c.name])),
    [clients],
  )

  // --- Filter + sort ---
  const filteredProjects = useMemo(() => {
    const kw = filterText.trim().toLowerCase()
    return [...(projects ?? [])]
      .filter((p) => {
        if (statusFilter !== 'all' && p.status !== statusFilter) return false
        if (!kw) return true
        return [
          p.name,
          p.phase,
          p.competitors,
          clientMap.get(p.client_id) ?? '',
        ].some((f) => (f ?? '').toLowerCase().includes(kw))
      })
      .sort((a, b) => {
        const so = statusOrder[a.status] - statusOrder[b.status]
        if (so !== 0) return so
        return (
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        )
      })
  }, [projects, filterText, statusFilter, clientMap])

  const grouped = useMemo(
    () =>
      Object.entries(PROJECT_STATUS_META).map(([status, meta]) => ({
        status,
        label: meta.label,
        projects: filteredProjects.filter((p) => p.status === status),
      })),
    [filteredProjects],
  )

  const inProgress =
    projects?.filter((p) => p.status === 'in_progress').length ?? 0

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

  const statusOptions = Object.entries(PROJECT_STATUS_META).map(
    ([value, m]) => ({ label: m.label, value }),
  )

  const rowFor = (p: Project) => (
    <ProjectRow
      key={p.id}
      project={p}
      clientName={clientMap.get(p.client_id) ?? '未知客户'}
      onClick={() => navigate(`/projects/${p.id}`)}
      menuItems={getMenuItems(p)}
    />
  )

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-header__title">项目</h1>
          <div className="page-header__sub">
            {projects?.length ?? 0} 个项目 · {inProgress} 个进行中
          </div>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setCreateOpen(true)}
        >
          新建项目
        </Button>
      </div>

      {/* Filter toolbar: local text filter + status segmented */}
      <div className="table-toolbar">
        <Input
          placeholder="按项目名、客户、阶段筛选…"
          prefix={<SearchOutlined style={{ color: 'var(--ink-3)' }} />}
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          allowClear
          style={{ maxWidth: 320 }}
        />
        <Segmented
          className="grouped-segment"
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as string)}
          options={[
            { label: '全部', value: 'all' },
            ...Object.entries(PROJECT_STATUS_META).map(([value, m]) => ({
              label: m.label,
              value,
            })),
          ]}
        />
      </div>

      {/* List */}
      {isLoading ? (
        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <Skeleton active paragraph={{ rows: 6 }} />
        </div>
      ) : projects?.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<FolderOutlined />}
            title="开始你的第一个项目"
            desc="创建项目后，客户、沟通记录、任务和文件都会集中在这里。"
            action={
              <Button type="primary" onClick={() => setCreateOpen(true)}>
                创建第一个项目
              </Button>
            }
          />
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<SearchOutlined />}
            title="没有匹配的项目"
            desc="换个关键词，或清除状态筛选再试。"
          />
        </div>
      ) : statusFilter === 'all' ? (
        // Grouped by status: 进行中 → 已暂停 → 已完成
        grouped.map(
          (g) =>
            g.projects.length > 0 && (
              <div key={g.status} className="section">
                <div className="section-label">
                  {g.label}
                  <span className="section-label__count">
                    {g.projects.length}
                  </span>
                </div>
                <div className="card row-list">{g.projects.map(rowFor)}</div>
              </div>
            ),
        )
      ) : (
        <div className="card row-list">{filteredProjects.map(rowFor)}</div>
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
        <Form form={form} layout="vertical">
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
            <Input placeholder="如：Web 应用开发" />
          </Form.Item>
          <Form.Item name="status" label="状态" initialValue="in_progress">
            <Select options={statusOptions} />
          </Form.Item>
          <Form.Item name="phase" label="当前阶段">
            <Input placeholder="如：信息收集" />
          </Form.Item>
          <Form.Item name="goals" label="项目目标" extra="每行一个目标">
            <Input.TextArea
              rows={3}
              placeholder={'如：完成需求分析\n提供修复建议'}
            />
          </Form.Item>
          {/* D5: CRM fields also on the board create form — entry parity
              with the detail edit modal. */}
          <Form.Item name="tech_approval" label="技术认可度">
            <Select
              allowClear
              options={TECH_APPROVAL_OPTIONS}
              placeholder="客户对技术的认可状态"
            />
          </Form.Item>
          <Form.Item name="competitors" label="竞争对手">
            <Input placeholder="如：奇安信、深信服" />
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
        <Form form={editForm} layout="vertical">
          <Form.Item
            name="name"
            label="项目名称"
            rules={[{ required: true, message: '请输入项目名称' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select options={statusOptions} />
          </Form.Item>
          <Form.Item name="phase" label="当前阶段">
            <Input placeholder="如：信息收集" />
          </Form.Item>
          <Form.Item name="goals" label="项目目标" extra="每行一个目标">
            <Input.TextArea rows={3} />
          </Form.Item>
          {/* D5: entry parity with the detail edit modal. */}
          <Form.Item name="tech_approval" label="技术认可度">
            <Select
              allowClear
              options={TECH_APPROVAL_OPTIONS}
              placeholder="客户对技术的认可状态"
            />
          </Form.Item>
          <Form.Item name="competitors" label="竞争对手">
            <Input placeholder="如：奇安信、深信服" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
