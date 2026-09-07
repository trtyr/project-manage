import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button, Form, Input, Select, Tabs, Modal, Skeleton, App } from 'antd'
import {
  ArrowLeftOutlined,
  EditOutlined,
  DeleteOutlined,
  EyeOutlined,
  ApartmentOutlined,
  MessageOutlined,
  TeamOutlined,
  DatabaseOutlined,
  FolderOpenOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  projectsApi,
  communicationsApi,
  tasksApi,
  clientsApi,
  assetsApi,
  filesApi,
  issuesApi,
  findingsApi,
  deliverablesApi,
} from '../api'
import type { TechApprovalStatus, ProjectFile } from '../types'
import Pill from '../components/ui/Pill'
import EmptyState from '../components/ui/EmptyState'
import {
  PROJECT_STATUS_META,
  TECH_APPROVAL_META,
  toneColor,
} from '../utils/status'
import FilePreview from '../components/FilePreview'
import PhasesTab from '../components/PhasesTab'
import DeliverablesTab from '../components/DeliverablesTab'
import MembersTab from '../components/MembersTab'
import CommunicationsTab from '../components/CommunicationsTab'
import TasksTab from '../components/TasksTab'
import AssetsTab from '../components/AssetsTab'
import FilesTab from '../components/FilesTab'
import IssuesTab from '../components/IssuesTab'
import FindingsTab from '../components/FindingsTab'
import GroupedTab from '../components/GroupedTab'
import OverviewTab from '../components/OverviewTab'

const TECH_APPROVAL_OPTIONS: Array<{
  label: string
  value: TechApprovalStatus
}> = [
  { label: '未接触', value: '未接触' },
  { label: 'POC中', value: 'POC中' },
  { label: '已认可', value: '已认可' },
  { label: '技术否决', value: '技术否决' },
]

function TabLabel({
  icon,
  label,
  count,
}: {
  icon: React.ReactNode
  label: string
  count?: number
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {icon}
      <span>{label}</span>
      {count !== undefined && count > 0 && (
        <span className="tab-label__count">{count}</span>
      )}
    </span>
  )
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { message, modal } = App.useApp()
  // D3: the overview timeline's 去填日期 empty-state button jumps here
  const [activeTab, setActiveTab] = useState('overview')
  const queryClient = useQueryClient()

  // --- Forms ---
  const [projectForm] = Form.useForm()

  // --- Modal open states ---
  const [previewFile, setPreviewFile] = useState<ProjectFile | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)

  // --- Queries ---
  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.get(id!),
    enabled: !!id,
  })

  const { data: client } = useQuery({
    queryKey: ['client', project?.client_id],
    queryFn: () => clientsApi.get(project!.client_id),
    enabled: !!project?.client_id,
  })

  // Tab-label counts. Components own their own data; React Query dedupes by key.
  const { data: communications } = useQuery({
    queryKey: ['communications', id],
    queryFn: () => communicationsApi.listByProject(id!),
    enabled: !!id,
  })

  const { data: tasks } = useQuery({
    queryKey: ['tasks', id],
    queryFn: () => tasksApi.listByProject(id!),
    enabled: !!id,
  })

  const { data: assets } = useQuery({
    queryKey: ['assets', id],
    queryFn: () => assetsApi.listByProject(id!),
    enabled: !!id,
  })

  const { data: files } = useQuery({
    queryKey: ['files', id],
    queryFn: () => filesApi.listByProject(id!),
    enabled: !!id,
  })

  const { data: issues } = useQuery({
    queryKey: ['issues', id],
    queryFn: () => issuesApi.listByProject(id!),
    enabled: !!id,
  })

  const { data: findings } = useQuery({
    queryKey: ['findings', id],
    queryFn: () => findingsApi.listByProject(id!),
    enabled: !!id,
  })

  const { data: deliverables } = useQuery({
    queryKey: ['deliverables', id],
    queryFn: () => deliverablesApi.listByProject(id!),
    enabled: !!id,
  })

  // --- Mutations ---
  const updateMut = useMutation({
    mutationFn: (v: Record<string, unknown>) =>
      projectsApi.update(id!, v as Parameters<typeof projectsApi.update>[1]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', id] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      message.success('已保存')
      setInfoOpen(false)
    },
  })

  if (isLoading) {
    return (
      <div>
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="card">
        <EmptyState
          icon={<FolderOpenOutlined />}
          title="项目不存在或已被删除"
          desc="它可能刚被删除，或者链接已过期。"
          action={<Button onClick={() => navigate('/')}>返回项目列表</Button>}
        />
      </div>
    )
  }

  const status = PROJECT_STATUS_META[project.status] ?? {
    label: project.status,
    tone: 'neutral' as const,
  }
  const techApproval = project.tech_approval
    ? TECH_APPROVAL_META[project.tech_approval]
    : undefined

  const statusOptions = Object.entries(PROJECT_STATUS_META).map(
    ([value, m]) => ({ label: m.label, value }),
  )

  return (
    <div className="fade-in">
      {/* === 顶部标题区 === */}
      <div className="detail-header">
        <div style={{ minWidth: 0 }}>
          <button
            type="button"
            className="back-link"
            onClick={() => navigate('/')}
          >
            <ArrowLeftOutlined style={{ fontSize: 12 }} /> 项目
          </button>
          <div className="detail-title-row">
            <h1 className="detail-title">{project.name}</h1>
            <Pill tone={status.tone} dot>
              {status.label}
            </Pill>
            {techApproval && (
              <Pill tone={techApproval.tone} dot small>
                {techApproval.label}
              </Pill>
            )}
          </div>
          <div className="detail-meta">
            {project.phase && <span>{project.phase}</span>}
            {client && (
              <>
                {project.phase && <span className="detail-meta__sep">·</span>}
                <span>{client.name}</span>
              </>
            )}
            {client?.contact_person && (
              <>
                <span className="detail-meta__sep">·</span>
                <span>{client.contact_person}</span>
              </>
            )}
            {client?.contact_info && (
              <>
                <span className="detail-meta__sep">·</span>
                <span className="mono">{client.contact_info}</span>
              </>
            )}
            {project.competitors && (
              <>
                <span className="detail-meta__sep">·</span>
                <span style={{ color: 'var(--ink-3)' }}>
                  竞品 {project.competitors}
                </span>
              </>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <Button
            icon={<EditOutlined />}
            onClick={() => {
              projectForm.setFieldsValue({
                ...project,
                goals: project.goals.join('\n'),
                tech_approval: project.tech_approval || undefined,
              })
              setInfoOpen(true)
            }}
          >
            编辑信息
          </Button>
          {/* L16: project-level delete uses modal.confirm everywhere —
              same pattern as ProjectBoard (row-level deletes keep
              Popconfirm, but project deletion is too destructive for a
              small popover). */}
          <Button
            danger
            icon={<DeleteOutlined />}
            onClick={() => {
              modal.confirm({
                title: `删除项目「${project.name}」？`,
                content:
                  '所有沟通记录、任务、文件、阶段等数据将一并删除，不可恢复。',
                okText: '确认删除',
                okType: 'danger',
                cancelText: '取消',
                onOk: () => {
                  // B11 fix: a failed delete used to navigate away silently.
                  return projectsApi
                    .delete(project.id)
                    .then(() => {
                      message.success('项目已删除')
                      navigate('/')
                    })
                    .catch(() => message.error('删除失败，请重试'))
                },
              })
            }}
          >
            删除
          </Button>
        </div>
      </div>

      {/* === Tabs === */}
      <Tabs
        className="project-tabs"
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'overview',
            label: <TabLabel icon={<EyeOutlined />} label="概览" />,
            children: (
              <OverviewTab
                projectId={id!}
                project={project}
                client={client}
                onGoFillPhaseDates={() => setActiveTab('progress')}
              />
            ),
          },
          {
            key: 'progress',
            label: <TabLabel icon={<ApartmentOutlined />} label="推进" />,
            children: (
              <GroupedTab
                items={[
                  {
                    key: 'phases',
                    label: '阶段',
                    content: (
                      <PhasesTab
                        projectId={id!}
                        files={files}
                        onFilePreview={(f) => setPreviewFile(f)}
                      />
                    ),
                  },
                  {
                    key: 'tasks',
                    label: '任务',
                    count: tasks?.length,
                    content: <TasksTab projectId={id!} />,
                  },
                  {
                    key: 'deliverables',
                    label: '交付物',
                    count: deliverables?.length,
                    content: <DeliverablesTab projectId={id!} />,
                  },
                ]}
              />
            ),
          },
          {
            key: 'client',
            label: <TabLabel icon={<MessageOutlined />} label="客户" />,
            children: (
              <GroupedTab
                items={[
                  {
                    key: 'communications',
                    label: '沟通记录',
                    count: communications?.length,
                    content: (
                      <CommunicationsTab
                        projectId={id!}
                        onFilePreview={(f) => setPreviewFile(f)}
                      />
                    ),
                  },
                  {
                    key: 'issues',
                    label: '客户关切',
                    count: issues?.length,
                    content: <IssuesTab projectId={id!} />,
                  },
                  {
                    key: 'findings',
                    label: '产品发现',
                    count: findings?.length,
                    content: <FindingsTab projectId={id!} />,
                  },
                ]}
              />
            ),
          },
          {
            key: 'materials',
            label: <TabLabel icon={<DatabaseOutlined />} label="资料" />,
            children: (
              <GroupedTab
                items={[
                  {
                    key: 'files',
                    label: '文件',
                    count: files?.length,
                    content: (
                      <FilesTab
                        projectId={id!}
                        onFilePreview={(f) => setPreviewFile(f)}
                      />
                    ),
                  },
                  {
                    key: 'assets',
                    label: '资产',
                    count: assets?.length,
                    content: <AssetsTab projectId={id!} />,
                  },
                ]}
              />
            ),
          },
          {
            key: 'members',
            label: <TabLabel icon={<TeamOutlined />} label="成员" />,
            children: <MembersTab projectId={id!} />,
          },
        ]}
      />

      {/* === 项目信息编辑 Modal === */}
      <Modal
        title="编辑项目信息"
        open={infoOpen}
        onCancel={() => setInfoOpen(false)}
        onOk={() => projectForm.submit()}
        confirmLoading={updateMut.isPending}
        width={520}
        okText="保存"
        cancelText="取消"
      >
        <Form
          form={projectForm}
          layout="vertical"
          onFinish={(v) => {
            const goals = v.goals?.split('\n').filter(Boolean) ?? []
            updateMut.mutate({ ...v, goals })
          }}
        >
          <Form.Item name="name" label="项目名称">
            <Input />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select options={statusOptions} />
          </Form.Item>
          <Form.Item name="tech_approval" label="技术认可">
            <Select
              options={TECH_APPROVAL_OPTIONS}
              placeholder="选择技术认可状态"
            />
          </Form.Item>
          <Form.Item name="competitors" label="竞品信息">
            <Input.TextArea rows={2} placeholder="还有谁在抢、他们报价如何…" />
          </Form.Item>
          <Form.Item name="phase" label="当前阶段">
            <Input placeholder="如：信息收集" />
          </Form.Item>
          <Form.Item name="goals" label="项目目标" extra="每行一个">
            <Input.TextArea rows={3} />
          </Form.Item>
          {client && (
            <div
              style={{
                padding: '10px 12px',
                background: 'var(--bg-subtle)',
                border: '1px solid var(--hairline)',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 9999,
                  background: toneColor('blue'),
                  flexShrink: 0,
                }}
              />
              <TextSecondary label="客户" />
              <span
                style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}
              >
                {client.name}
              </span>
              {client.contact_person && (
                <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                  {client.contact_person}
                </span>
              )}
              {client.contact_info && (
                <span className="mono" style={{ color: 'var(--ink-3)' }}>
                  {client.contact_info}
                </span>
              )}
            </div>
          )}
        </Form>
      </Modal>

      {/* File preview */}
      <FilePreview
        file={previewFile}
        open={!!previewFile}
        onClose={() => setPreviewFile(null)}
      />
    </div>
  )
}

function TextSecondary({ label }: { label: string }) {
  return (
    <span
      style={{
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: 'var(--ink-3)',
      }}
    >
      {label}
    </span>
  )
}
