import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Typography,
  Button,
  Form,
  Input,
  Select,
  Table,
  Tabs,
  Tag,
  Modal,
  DatePicker,
  Skeleton,
  Space,
  Upload,
  Popconfirm,
  Empty,
  App,
  Segmented,
} from 'antd'
import type { UploadFile } from 'antd'
import {
  ArrowLeftOutlined,
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  DownloadOutlined,
  EyeOutlined,
  PaperClipOutlined,
  ApartmentOutlined,
  MessageOutlined,
  CheckCircleOutlined,
  TeamOutlined,
  DatabaseOutlined,
  FolderOutlined,
  LinkOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import {
  projectsApi,
  communicationsApi,
  tasksApi,
  clientsApi,
  assetsApi,
  filesApi,
  phasesApi,
} from '../api'
import type { ProjectStatus, TaskStatus, Asset, ProjectFile } from '../types'
import FilePreview from '../components/FilePreview'
import PhasesTab from '../components/PhasesTab'
import MembersTab from '../components/MembersTab'
import { formatSize } from '../utils/format'
import CommunicationList from '../components/CommunicationList'
import ParticipantsInput from '../components/ParticipantsInput'

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
  const [commForm] = Form.useForm()
  const [taskForm] = Form.useForm()
  const [assetForm] = Form.useForm()
  const [fileDesc, setFileDesc] = useState('')
  const [fileTags, setFileTags] = useState('')

  // --- Modal open states ---
  const [commOpen, setCommOpen] = useState(false)
  const [taskOpen, setTaskOpen] = useState(false)
  const [assetOpen, setAssetOpen] = useState(false)
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null)
  const [fileOpen, setFileOpen] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewFile, setPreviewFile] = useState<ProjectFile | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)
  const [uploadMode, setUploadMode] = useState<'file' | 'link'>('file')
  const [linkUrl, setLinkUrl] = useState('')
  const [linkName, setLinkName] = useState('')

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

  const { data: phases } = useQuery({
    queryKey: ['phases', id],
    queryFn: () => phasesApi.listByProject(id!),
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

  const createCommMut = useMutation({
    mutationFn: (v: {
      content: string
      occurred_at: string
      participants?: string
      conclusion?: string
    }) => communicationsApi.create(id!, v),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['communications', id] })
      message.success('沟通记录已添加')
      setCommOpen(false)
      commForm.resetFields()
    },
  })

  const createTaskMut = useMutation({
    mutationFn: (v: {
      title: string
      status?: TaskStatus
      planned_date?: string
    }) => tasksApi.create(id!, v),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', id] })
      message.success('任务已添加')
      setTaskOpen(false)
      taskForm.resetFields()
    },
  })

  const updateTaskMut = useMutation({
    mutationFn: ({
      taskId,
      data,
    }: {
      taskId: string
      data: { status?: TaskStatus }
    }) => tasksApi.update(taskId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', id] })
    },
  })

  const createAssetMut = useMutation({
    mutationFn: (data: Parameters<typeof assetsApi.create>[1]) =>
      assetsApi.create(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets', id] })
      message.success('资产已添加')
      setAssetOpen(false)
      setEditingAsset(null)
      assetForm.resetFields()
    },
  })

  const deleteAssetMut = useMutation({
    mutationFn: assetsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets', id] })
      message.success('已删除')
    },
  })

  const updateAssetMut = useMutation({
    mutationFn: (data: {
      aid: string
      body: Parameters<typeof assetsApi.update>[1]
    }) => assetsApi.update(data.aid, data.body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets', id] })
      message.success('资产已更新')
      setAssetOpen(false)
      setEditingAsset(null)
      assetForm.resetFields()
    },
  })

  const uploadFileMut = useMutation({
    mutationFn: () => {
      if (uploadMode === 'link') {
        if (!linkUrl.trim()) throw new Error('no url')
        const tags = fileTags
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        return filesApi.createLink(id!, {
          name: linkName.trim() || linkUrl.trim(),
          url: linkUrl.trim(),
          description: fileDesc || undefined,
          tags,
        })
      }
      if (!selectedFile) throw new Error('no file')
      const tags = fileTags
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      return filesApi.upload(id!, selectedFile, fileDesc || undefined, tags)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files', id] })
      message.success(uploadMode === 'link' ? '链接已添加' : '文件已上传')
      setFileOpen(false)
      setSelectedFile(null)
      setFileDesc('')
      setFileTags('')
      setLinkUrl('')
      setLinkName('')
      setUploadMode('file')
    },
    onError: () => message.error(uploadMode === 'link' ? '添加失败' : '上传失败'),
  })

  const deleteFileMut = useMutation({
    mutationFn: filesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files', id] })
      message.success('文件已删除')
    },
  })

  const handleDownload = async (file: ProjectFile) => {
    try {
      const blob = await filesApi.download(file.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = file.original_name
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      message.error('下载失败')
    }
  }

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
            children: (
              <div>
                <div className="tab-action">
                  <Button
                    icon={<PlusOutlined />}
                    onClick={() => setCommOpen(true)}
                  >
                    添加沟通记录
                  </Button>
                </div>
                <CommunicationList
                  communications={communications}
                  projectId={id!}
                  files={files}
                />
              </div>
            ),
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
            children: (
              <div>
                <div className="tab-action">
                  <Button
                    icon={<PlusOutlined />}
                    onClick={() => setTaskOpen(true)}
                  >
                    添加任务
                  </Button>
                </div>
                <Table
                  dataSource={tasks}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  columns={[
                    { title: '任务', dataIndex: 'title', key: 'title' },
                    {
                      title: '状态',
                      dataIndex: 'status',
                      key: 'status',
                      width: 120,
                      render: (s: TaskStatus, r: { id: string }) => (
                        <Select
                          size="small"
                          value={s}
                          style={{ width: 100 }}
                          options={[
                            { label: '当前', value: 'current' },
                            { label: '下一步', value: 'next' },
                            { label: '待办', value: 'todo' },
                          ]}
                          onChange={(val) =>
                            updateTaskMut.mutate({
                              taskId: r.id,
                              data: { status: val },
                            })
                          }
                        />
                      ),
                    },
                    {
                      title: '计划日期',
                      dataIndex: 'planned_date',
                      key: 'planned_date',
                      width: 120,
                      render: (v: string | null) => v ?? '-',
                    },
                  ]}
                  locale={{ emptyText: '还没有任务' }}
                />
              </div>
            ),
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
            children: (
              <div>
                <div className="tab-action">
                  <Button
                    icon={<PlusOutlined />}
                    onClick={() => {
                      setEditingAsset(null)
                      assetForm.resetFields()
                      setAssetOpen(true)
                    }}
                  >
                    添加资产
                  </Button>
                </div>
                <Table
                  dataSource={assets}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  columns={[
                    { title: '名称', dataIndex: 'name', key: 'name' },
                    {
                      title: '类型',
                      dataIndex: 'asset_type',
                      key: 'asset_type',
                      width: 120,
                      render: (t: string) => <Tag>{t}</Tag>,
                    },
                    {
                      title: '值',
                      dataIndex: 'value',
                      key: 'value',
                      render: (v: string | null) => v ?? '-',
                    },
                    {
                      title: '描述',
                      dataIndex: 'description',
                      key: 'description',
                      render: (v: string | null) => v ?? '-',
                    },
                    {
                      title: '',
                      key: 'action',
                      width: 90,
                      render: (_: unknown, r: Asset) => (
                        <Space size={0}>
                          <Button
                            type="text"
                            size="small"
                            icon={<EditOutlined />}
                            onClick={() => {
                              setEditingAsset(r)
                              assetForm.setFieldsValue({
                                name: r.name,
                                asset_type: r.asset_type,
                                value: r.value,
                                description: r.description,
                              })
                              setAssetOpen(true)
                            }}
                          />
                          <Popconfirm
                            title="删除该资产？"
                            onConfirm={() => deleteAssetMut.mutate(r.id)}
                          >
                            <Button
                              type="text"
                              danger
                              size="small"
                              icon={<DeleteOutlined />}
                            />
                          </Popconfirm>
                        </Space>
                      ),
                    },
                  ]}
                  locale={{ emptyText: '还没有记录资产' }}
                />
              </div>
            ),
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
            children: (
              <div>
                <div className="tab-action">
                  <Button
                    icon={<PlusOutlined />}
                    onClick={() => setFileOpen(true)}
                  >
                    上传文件
                  </Button>
                </div>
                <Table
                  dataSource={files}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  columns={[
                    {
                      title: '文件名',
                      dataIndex: 'original_name',
                      key: 'original_name',
                      render: (name: string, r: ProjectFile) => (
                        <Space>
                          {r.source_type === 'link' ? (
                            <LinkOutlined style={{ color: 'var(--muted-hex)' }} />
                          ) : (
                            <PaperClipOutlined style={{ color: 'var(--muted-hex)' }} />
                          )}
                          {r.source_type === 'link' && r.url ? (
                            <a
                              href={r.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={r.url}
                            >
                              {name}
                            </a>
                          ) : (
                            <a
                              role="button"
                              tabIndex={0}
                              title={name}
                              onClick={() => setPreviewFile(r)}
                              onKeyDown={(e) => { if (e.key === 'Enter') setPreviewFile(r) }}
                              style={{ cursor: 'pointer' }}
                            >
                              {name}
                            </a>
                          )}
                        </Space>
                      ),
                    },
                    {
                      title: '大小',
                      dataIndex: 'file_size',
                      key: 'file_size',
                      width: 90,
                      render: (s: number, r: ProjectFile) =>
                        r.source_type === 'link' ? '-' : formatSize(s),
                    },
                    {
                      title: '标签',
                      dataIndex: 'tags',
                      key: 'tags',
                      render: (tags: string[]) =>
                        tags.map((t) => (
                          <Tag key={t} style={{ marginBottom: 2 }}>
                            {t}
                          </Tag>
                        )),
                    },
                    {
                      title: '描述',
                      dataIndex: 'description',
                      key: 'description',
                      render: (v: string | null) => v ?? '-',
                    },
                    {
                      title: '上传时间',
                      dataIndex: 'created_at',
                      key: 'created_at',
                      width: 120,
                      render: (v: string) =>
                        dayjs(v).format('YYYY-MM-DD HH:mm'),
                    },
                    {
                      title: '来源',
                      key: 'source',
                      width: 140,
                      render: (_: unknown, r: ProjectFile) => {
                        if (!r.communication_id) return <span style={{ color: 'var(--muted-hex)' }}>直接上传</span>
                        const comm = communications?.find((c) => c.id === r.communication_id)
                        if (!comm) return <span style={{ color: 'var(--muted-hex)' }}>已关联</span>
                        const preview = comm.content.slice(0, 12).replace(/\n/g, ' ')
                        return (
                          <a
                            role="button"
                            tabIndex={0}
                            title={`${dayjs(comm.occurred_at).format('M月D日')}的沟通记录`}
                            onClick={() => navigate(`/projects/${id}/communications/${r.communication_id}`)}
                            onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/projects/${id}/communications/${r.communication_id}`) }}
                            style={{ cursor: 'pointer' }}
                          >
                            沟通 · {preview}{comm.content.length > 12 ? '…' : ''}
                          </a>
                        )
                      },
                    },
                    {
                      title: '阶段',
                      key: 'phase',
                      width: 120,
                      render: (_: unknown, r: ProjectFile) => {
                        if (!r.phase_id) return <span style={{ color: 'var(--muted-hex)' }}>-</span>
                        const ph = phases?.find((p) => p.id === r.phase_id)
                        return <span title={ph?.description || ''}>{ph?.name ?? '未知阶段'}</span>
                      },
                    },
                    {
                      title: '',
                      key: 'action',
                      width: 110,
                      render: (_: unknown, r: ProjectFile) => (
                        <Space>
                          {r.source_type === 'link' && r.url ? (
                            <Button
                              type="text"
                              size="small"
                              icon={<LinkOutlined />}
                              onClick={() => window.open(r.url!, '_blank', 'noopener,noreferrer')}
                            />
                          ) : (
                            <>
                              <Button
                                type="text"
                                size="small"
                                icon={<EyeOutlined />}
                                onClick={() => setPreviewFile(r)}
                              />
                              <Button
                                type="text"
                                size="small"
                                icon={<DownloadOutlined />}
                                onClick={() => handleDownload(r)}
                              />
                            </>
                          )}
                          <Popconfirm
                            title={r.source_type === 'link' ? '删除该链接？' : '删除该文件？'}
                            onConfirm={() => deleteFileMut.mutate(r.id)}
                          >
                            <Button
                              type="text"
                              danger
                              size="small"
                              icon={<DeleteOutlined />}
                            />
                          </Popconfirm>
                        </Space>
                      ),
                    },
                  ]}
                  locale={{ emptyText: '还没有上传文件' }}
                />
              </div>
            ),
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

      {/* === 沟通记录 Modal === */}
      <Modal
        title="添加沟通记录"
        open={commOpen}
        onCancel={() => setCommOpen(false)}
        onOk={() =>
          commForm.validateFields().then(async (v) => {
            const comm = await createCommMut.mutateAsync({
              ...v,
              occurred_at: v.occurred_at.toISOString(),
            })
            if (v.comm_file_ids?.length) {
              await Promise.all(
                v.comm_file_ids.map((fileId: string) =>
                  filesApi.link(fileId, comm.id),
                ),
              )
              queryClient.invalidateQueries({ queryKey: ['files', id] })
            }
          })
        }
        confirmLoading={createCommMut.isPending}
        width="100%"
        centered
        styles={{ body: { height: '85vh', overflow: 'auto' } }}
        okText="添加"
        cancelText="取消"
      >
        <Form form={commForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="occurred_at"
            label="沟通时间"
            rules={[{ required: true, message: '请选择时间' }]}
            initialValue={dayjs()}
          >
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="content"
            label="沟通内容"
            rules={[{ required: true, message: '请输入内容' }]}
          >
            <Input.TextArea rows={12} placeholder="沟通了什么…" />
          </Form.Item>
          <Form.Item name="participants" label="参与人">
            <ParticipantsInput />
          </Form.Item>
          <Form.Item name="conclusion" label="结论">
            <Input.TextArea rows={2} placeholder="达成了什么结论…" />
          </Form.Item>
          <Form.Item name="comm_file_ids" label="关联文件">
            <Select
              mode="multiple"
              placeholder="选择要关联的文件（可选）"
              options={files
                ?.filter((f) => !f.communication_id)
                .map((f) => ({
                  label: f.original_name,
                  value: f.id,
                }))}
              allowClear
              optionFilterProp="label"
              notFoundContent="暂无可关联的文件"
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* === 任务 Modal === */}
      <Modal
        title="添加任务"
        open={taskOpen}
        onCancel={() => setTaskOpen(false)}
        onOk={() =>
          taskForm.validateFields().then((v) => {
            createTaskMut.mutate({
              ...v,
              planned_date: v.planned_date?.format('YYYY-MM-DD'),
            })
          })
        }
        confirmLoading={createTaskMut.isPending}
        width={480}
        okText="添加"
        cancelText="取消"
      >
        <Form form={taskForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="title"
            label="任务标题"
            rules={[{ required: true, message: '请输入任务标题' }]}
          >
            <Input placeholder="如：端口扫描" />
          </Form.Item>
          <Form.Item name="status" label="状态" initialValue="todo">
            <Select
              options={[
                { label: '当前', value: 'current' },
                { label: '下一步', value: 'next' },
                { label: '待办', value: 'todo' },
              ]}
            />
          </Form.Item>
          <Form.Item name="planned_date" label="计划日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* === 资产 Modal === */}
      <Modal
        title={editingAsset ? '编辑资产' : '添加资产'}
        open={assetOpen}
        onCancel={() => {
          setAssetOpen(false)
          setEditingAsset(null)
          assetForm.resetFields()
        }}
        onOk={() =>
          assetForm.validateFields().then((v) => {
            if (editingAsset) {
              updateAssetMut.mutate({ aid: editingAsset.id, body: v })
            } else {
              createAssetMut.mutate(v)
            }
          })
        }
        confirmLoading={createAssetMut.isPending || updateAssetMut.isPending}
        width={480}
        okText={editingAsset ? '保存' : '添加'}
        cancelText="取消"
      >
        <Form form={assetForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="名称"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="如：OA 服务器 / 防火墙-1" />
          </Form.Item>
          <Form.Item name="asset_type" label="类型">
            <Input placeholder="如：服务器 / 域名 / 防火墙 / 网关（自由填写）" />
          </Form.Item>
          <Form.Item name="value" label="值">
            <Input placeholder="如：192.168.1.1 / example.com" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* === 文件上传 Modal === */}
      <Modal
        title={
          <Segmented
            value={uploadMode}
            onChange={(v) => setUploadMode(v as 'file' | 'link')}
            options={[
              { label: '上传文件', value: 'file' },
              { label: '添加链接', value: 'link' },
            ]}
          />
        }
        open={fileOpen}
        onCancel={() => {
          setFileOpen(false)
          setSelectedFile(null)
          setFileDesc('')
          setFileTags('')
          setLinkUrl('')
          setLinkName('')
          setUploadMode('file')
        }}
        onOk={() => uploadFileMut.mutate()}
        confirmLoading={uploadFileMut.isPending}
        okText={uploadMode === 'link' ? '添加' : '上传'}
        cancelText="取消"
        okButtonProps={{ disabled: uploadMode === 'file' ? !selectedFile : !linkUrl.trim() }}
        width={480}
      >
        <div style={{ marginTop: 16 }}>
          {uploadMode === 'file' ? (
            <Upload.Dragger
              maxCount={1}
              beforeUpload={(file) => {
                setSelectedFile(file)
                return false
              }}
              onRemove={() => setSelectedFile(null)}
              fileList={
                selectedFile
                  ? [
                      {
                        uid: '-1',
                        name: selectedFile.name,
                      } as UploadFile,
                    ]
                  : []
              }
            >
              <p style={{ margin: 0, color: 'var(--muted-hex)' }}>
                点击或拖拽文件到此处
              </p>
            </Upload.Dragger>
          ) : (
            <>
              <Input
                placeholder="链接地址（https://…）"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                prefix={<LinkOutlined style={{ color: 'var(--muted-hex)' }} />}
              />
              <Input
                style={{ marginTop: 8 }}
                placeholder="名称（可选，留空则用链接地址）"
                value={linkName}
                onChange={(e) => setLinkName(e.target.value)}
              />
            </>
          )}
          <Input.TextArea
            style={{ marginTop: 12 }}
            rows={2}
            placeholder="描述（可选）"
            value={fileDesc}
            onChange={(e) => setFileDesc(e.target.value)}
          />
          <Input
            style={{ marginTop: 8 }}
            placeholder="标签，逗号分隔（可选）"
            value={fileTags}
            onChange={(e) => setFileTags(e.target.value)}
          />
        </div>
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
