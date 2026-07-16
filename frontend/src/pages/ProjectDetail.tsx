import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Typography,
  Button,
  Form,
  Input,
  Select,
  Tabs,
  Tag,
  Modal,
  Skeleton,
  Space,
  Popconfirm,
  Empty,
  App,
} from 'antd'
import {
  ArrowLeftOutlined,
  EditOutlined,
  DeleteOutlined,
  ApartmentOutlined,
  MessageOutlined,
  CheckCircleOutlined,
  TeamOutlined,
  DatabaseOutlined,
  FolderOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { projectsApi, communicationsApi, tasksApi, clientsApi, assetsApi, filesApi } from '../api'
import type { ProjectStatus, ProjectFile } from '../types'
import FilePreview from '../components/FilePreview'
import PhasesTab from '../components/PhasesTab'
import MembersTab from '../components/MembersTab'
import CommunicationsTab from '../components/CommunicationsTab'
import TasksTab from '../components/TasksTab'
import AssetsTab from '../components/AssetsTab'
import FilesTab from '../components/FilesTab'

const { Title, Text } = Typography

const statusLabel: Record<ProjectStatus, string> = {
  in_progress: '进行中',
  completed: '已完成',
  paused: '已暂停',
}

function TabLabel({ icon, label, count }: { icon: React.ReactNode; label: string; count?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {icon}
      <span>{label}</span>
      {count !== undefined && count > 0 && (
        <span style={{ fontSize: 12, color: 'var(--muted-hex)', fontVariantNumeric: 'tabular-nums' }}>
          {count}
        </span>
      )}
    </span>
  )
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { message } = App.useApp()
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
      <div style={{ padding: 24 }}>
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    )
  }

  if (!project) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Empty description="项目不存在或已被删除" />
        <Button onClick={() => navigate('/')} style={{ marginTop: 16 }}>
          返回项目列表
        </Button>
      </div>
    )
  }

  return (
    <div className="fade-in">
      {/* === 顶部标题区 === */}
      <div className="detail-header">
        <div>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/')}
            className="back-btn"
            style={{ marginBottom: 8 }}
          >
            返回
          </Button>
          <div className="detail-title-row">
            <Title
              level={2}
              style={{
                margin: 0,
                fontWeight: 700,
                fontSize: 24,
                letterSpacing: '-0.02em',
              }}
            >
              {project.name}
            </Title>
            <Tag
              className={`status-badge status-badge--${project.status as ProjectStatus}`}
            >
              {statusLabel[project.status as ProjectStatus] ?? project.status}
            </Tag>
            {project.phase && (
              <Text type="secondary" style={{ fontSize: 14 }}>
                · {project.phase}
              </Text>
            )}
          </div>
          {client && (
            <div className="detail-meta">
              客户：{client.name}
              {client.contact_person && ` · ${client.contact_person}`}
              {client.contact_info && ` · ${client.contact_info}`}
            </div>
          )}
        </div>
        <Space>
          <Button
            icon={<EditOutlined />}
            onClick={() => {
              projectForm.setFieldsValue({
                ...project,
                goals: project.goals.join('\n'),
              })
              setInfoOpen(true)
            }}
          >
            编辑信息
          </Button>
          <Popconfirm
            title={`删除项目「${project.name}」？`}
            description="所有数据将永久删除，不可恢复"
            okText="确认删除"
            okType="danger"
            cancelText="取消"
            onConfirm={() => {
              projectsApi.delete(project.id).then(() => {
                message.success('项目已删除')
                navigate('/')
              })
            }}
          >
            <Button danger icon={<DeleteOutlined />}>
              删除项目
            </Button>
          </Popconfirm>
        </Space>
      </div>

      {/* === Tabs === */}
      <Tabs
        className="project-tabs"
        items={[
          {
            key: 'phases',
            label: (
              <TabLabel icon={<ApartmentOutlined />} label="阶段规划" />
            ),
            children: <PhasesTab projectId={id!} files={files} onFilePreview={(f) => setPreviewFile(f)} />,
          },
          {
            key: 'communications',
            label: (
              <TabLabel
                icon={<MessageOutlined />}
                label="沟通记录"
                count={communications?.length}
              />
            ),
            children: <CommunicationsTab projectId={id!} />,
          },
          {
            key: 'tasks',
            label: (
              <TabLabel
                icon={<CheckCircleOutlined />}
                label="任务"
                count={tasks?.length}
              />
            ),
            children: <TasksTab projectId={id!} />,
          },
          {
            key: 'assets',
            label: (
              <TabLabel
                icon={<DatabaseOutlined />}
                label="资产清单"
                count={assets?.length}
              />
            ),
            children: <AssetsTab projectId={id!} />,
          },
          {
            key: 'members',
            label: (
              <TabLabel icon={<TeamOutlined />} label="成员" />
            ),
            children: <MembersTab projectId={id!} />,
          },
          {
            key: 'files',
            label: (
              <TabLabel
                icon={<FolderOutlined />}
                label="文件管理"
                count={files?.length}
              />
            ),
            children: <FilesTab projectId={id!} onFilePreview={(f) => setPreviewFile(f)} />,
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
          style={{ marginTop: 16 }}
          onFinish={(v) => {
            const goals = v.goals?.split('\n').filter(Boolean) ?? []
            updateMut.mutate({ ...v, goals })
          }}
        >
          <Form.Item name="name" label="项目名称">
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
          <Form.Item name="goals" label="项目目标" extra="每行一个">
            <Input.TextArea rows={3} />
          </Form.Item>
          {client && (
            <div
              style={{
                padding: '12px 16px',
                background: 'rgba(var(--primary-rgb), 0.03)',
                borderRadius: 8,
              }}
            >
              <Text
                type="secondary"
                style={{ fontSize: 13, display: 'block', marginBottom: 4 }}
              >
                客户
              </Text>
              <Text strong>{client.name}</Text>
              {client.contact_person && (
                <Text type="secondary">{' · '}{client.contact_person}</Text>
              )}
              {client.contact_info && (
                <Text type="secondary">{' · '}{client.contact_info}</Text>
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