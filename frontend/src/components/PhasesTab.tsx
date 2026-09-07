import { useState } from 'react'
import {
  Button,
  Tooltip,
  Space,
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  Popconfirm,
  Upload,
  App,
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  PaperClipOutlined,
  ThunderboltOutlined,
  UploadOutlined,
  ApartmentOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { phasesApi, filesApi } from '../api'
import type { Phase, ProjectFile } from '../types'
import Pill from './ui/Pill'
import EmptyState from './ui/EmptyState'
import { PHASE_STATUS_META, metaOptions } from '../utils/status'

interface PhaseNode extends Phase {
  children: PhaseNode[]
}

function buildTree(phases: Phase[]): PhaseNode[] {
  const map = new Map<string, PhaseNode>()
  const roots: PhaseNode[] = []
  phases.forEach((p) => map.set(p.id, { ...p, children: [] }))
  phases.forEach((p) => {
    const node = map.get(p.id)!
    if (p.parent_id && map.has(p.parent_id)) {
      map.get(p.parent_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}

interface StandardPhaseTemplate {
  name: string
  description: string
  sort_order: number
}

const STANDARD_PHASES: StandardPhaseTemplate[] = [
  {
    name: '需求挖掘',
    description: '线索验证，确认客户真实需求',
    sort_order: 1,
  },
  { name: '技术预研', description: '技术可行性评估，环境调研', sort_order: 2 },
  { name: '方案论证', description: '方案设计，技术交流', sort_order: 3 },
  { name: '立项审批', description: '推动客户内部立项', sort_order: 4 },
  { name: '启动采购', description: '采购流程启动，预算确认', sort_order: 5 },
  { name: '商务招标', description: '投标文件准备，商务谈判', sort_order: 6 },
  { name: '签单冲刺', description: '最终技术兜底，签单闭环', sort_order: 7 },
]

interface Props {
  projectId: string
  files?: ProjectFile[]
  onFilePreview?: (f: ProjectFile) => void
}

export default function PhasesTab({ projectId, files, onFilePreview }: Props) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Phase | null>(null)
  const [form] = Form.useForm()
  const [editForm] = Form.useForm()

  const { data: phases } = useQuery({
    queryKey: ['phases', projectId],
    queryFn: () => phasesApi.listByProject(projectId),
  })

  const createMut = useMutation({
    mutationFn: (data: Parameters<typeof phasesApi.create>[1]) =>
      phasesApi.create(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phases', projectId] })
      message.success('阶段已创建')
      setCreateOpen(false)
      form.resetFields()
    },
  })

  const updateMut = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string
      data: Parameters<typeof phasesApi.update>[1]
    }) => phasesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phases', projectId] })
      message.success('已保存')
      setEditTarget(null)
    },
  })

  const deleteMut = useMutation({
    mutationFn: phasesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phases', projectId] })
      message.success('已删除')
    },
  })

  const linkFileMut = useMutation({
    mutationFn: ({
      fileId,
      phaseId,
    }: {
      fileId: string
      phaseId: string | null
    }) => filesApi.linkPhase(fileId, phaseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files', projectId] })
    },
  })

  const uploadFileMut = useMutation({
    mutationFn: (file: File) => filesApi.upload(projectId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files', projectId] })
      message.success('文件已上传')
    },
  })

  const importTemplateMut = useMutation({
    mutationFn: async () => {
      for (const phase of STANDARD_PHASES) {
        await phasesApi.create(projectId, {
          name: phase.name,
          description: phase.description,
          sort_order: phase.sort_order,
        })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phases', projectId] })
      message.success('七阶段模板已导入')
    },
  })

  const tree = buildTree(phases ?? [])

  const renderNode = (node: PhaseNode, depth: number) => {
    const cfg = PHASE_STATUS_META[node.status] ?? {
      label: node.status,
      tone: 'neutral' as const,
    }
    const phaseFiles = (files ?? []).filter((f) => f.phase_id === node.id)
    const availableFiles = (files ?? []).filter((f) => !f.phase_id)
    return (
      <div key={node.id}>
        <div
          className="phase-row"
          style={depth > 0 ? { marginLeft: depth * 24 } : undefined}
        >
          <Pill tone={cfg.tone} dot>
            {cfg.label}
          </Pill>
          <span className="phase-row__name">{node.name}</span>
          {node.planned_start && (
            <span className="phase-row__dates">
              {dayjs(node.planned_start).format('MM/DD')}
              {node.planned_end &&
                ` → ${dayjs(node.planned_end).format('MM/DD')}`}
            </span>
          )}
          {node.description && (
            <span className="phase-row__desc" title={node.description}>
              {node.description}
            </span>
          )}
          <Space style={{ marginLeft: 'auto', flexShrink: 0 }}>
            <Tooltip title="添加子阶段">
              <Button
                type="text"
                size="small"
                icon={<PlusOutlined />}
                aria-label={`为 ${node.name} 添加子阶段`}
                onClick={() => {
                  setCreateOpen(true)
                  form.setFieldsValue({ parent_id: node.id })
                }}
              />
            </Tooltip>
            <Tooltip title="编辑阶段">
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                aria-label={`编辑阶段 ${node.name}`}
                onClick={() => {
                  setEditTarget(node)
                  editForm.setFieldsValue({
                    ...node,
                    planned_start: node.planned_start
                      ? dayjs(node.planned_start)
                      : null,
                    planned_end: node.planned_end
                      ? dayjs(node.planned_end)
                      : null,
                  })
                }}
              />
            </Tooltip>
            <Popconfirm
              title="删除该阶段？子阶段也会一起删除"
              onConfirm={() => deleteMut.mutate(node.id)}
            >
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                aria-label={`删除阶段 ${node.name}`}
              />
            </Popconfirm>
          </Space>
        </div>

        {/* 阶段产物 */}
        <div
          className="phase-files"
          style={
            depth > 0
              ? { marginLeft: `calc(${depth * 24}px + 28px)` }
              : undefined
          }
        >
          <PaperClipOutlined style={{ color: 'var(--ink-3)', fontSize: 12 }} />
          {phaseFiles.map((f) => (
            <span key={f.id} className="file-chip">
              {f.source_type === 'link' ? (
                <a
                  href={f.url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  title={f.original_name}
                  className="file-chip__name"
                >
                  🔗 {f.original_name}
                </a>
              ) : (
                <span
                  role="button"
                  tabIndex={0}
                  title={f.original_name}
                  className="file-chip__name"
                  onClick={(e) => {
                    e.stopPropagation()
                    onFilePreview?.(f)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onFilePreview?.(f)
                  }}
                >
                  {f.original_name}
                </span>
              )}
              <Popconfirm
                title="取消关联？"
                okText="取消关联"
                cancelText="保留"
                onConfirm={() =>
                  linkFileMut.mutate({ fileId: f.id, phaseId: null })
                }
              >
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  style={{ fontSize: 11, padding: 0, width: 18 }}
                  aria-label={`取消关联 ${f.original_name}`}
                />
              </Popconfirm>
            </span>
          ))}
          {availableFiles.length > 0 && (
            <Select
              size="small"
              placeholder="关联文件"
              variant="borderless"
              className="cell-select"
              style={{ width: 200 }}
              value={undefined}
              onChange={(fileId: string) => {
                linkFileMut.mutate({ fileId, phaseId: node.id })
              }}
              options={availableFiles.map((f) => ({
                label: f.original_name,
                value: f.id,
              }))}
              showSearch
              optionFilterProp="label"
            />
          )}
          <Upload
            showUploadList={false}
            beforeUpload={(file) => {
              uploadFileMut.mutate(file)
              return false
            }}
          >
            <Tooltip title="上传新文件到此阶段">
              <Button
                type="text"
                size="small"
                icon={<UploadOutlined />}
                aria-label={`上传文件到阶段 ${node.name}`}
              />
            </Tooltip>
          </Upload>
          {phaseFiles.length === 0 && !availableFiles.length && (
            <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>
              暂无产物
            </span>
          )}
        </div>

        {node.children.length > 0 && (
          <div className="phase-children">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="table-toolbar">
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            setCreateOpen(true)
            form.resetFields()
          }}
        >
          添加阶段
        </Button>
        <Tooltip title="一键导入标准七阶段模板">
          {(phases?.length ?? 0) > 0 ? (
            <Popconfirm
              title="当前已有阶段，七阶段模板将追加在末尾，确认导入？"
              okText="确认导入"
              cancelText="取消"
              onConfirm={() => importTemplateMut.mutate()}
            >
              <Button
                icon={<ThunderboltOutlined />}
                loading={importTemplateMut.isPending}
              >
                导入七阶段模板
              </Button>
            </Popconfirm>
          ) : (
            <Button
              icon={<ThunderboltOutlined />}
              loading={importTemplateMut.isPending}
              onClick={() => importTemplateMut.mutate()}
            >
              导入七阶段模板
            </Button>
          )}
        </Tooltip>
      </div>
      {tree.length > 0 ? (
        tree.map((node) => renderNode(node, 0))
      ) : (
        <div className="card">
          <EmptyState
            icon={<ApartmentOutlined />}
            title="还没有阶段规划"
            desc="从需求挖掘到签单冲刺，用阶段拆解整个推进过程。"
            action={
              <Button
                type="primary"
                icon={<ThunderboltOutlined />}
                onClick={() => importTemplateMut.mutate()}
                loading={importTemplateMut.isPending}
              >
                导入七阶段模板
              </Button>
            }
          />
        </div>
      )}

      {/* Create Modal */}
      <Modal
        title="添加阶段"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() =>
          form.validateFields().then((v) => {
            createMut.mutate({
              ...v,
              planned_start: v.planned_start?.toISOString(),
              planned_end: v.planned_end?.toISOString(),
            })
          })
        }
        confirmLoading={createMut.isPending}
        width={480}
        okText="添加"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="阶段名称"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="如：需求分析 / 方案设计" />
          </Form.Item>
          <Form.Item name="parent_id" label="父阶段" extra="不选则为顶级阶段">
            <Select
              allowClear
              placeholder="选择父阶段（可选）"
              options={phases?.map((p) => ({ label: p.name, value: p.id }))}
            />
          </Form.Item>
          <Form.Item name="status" label="状态" initialValue="pending">
            <Select options={metaOptions(PHASE_STATUS_META)} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0 12px',
            }}
          >
            <Form.Item name="planned_start" label="计划开始">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="planned_end" label="计划结束">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      {/* Edit Modal */}
      <Modal
        title="编辑阶段"
        open={!!editTarget}
        onCancel={() => setEditTarget(null)}
        onOk={() =>
          editForm.validateFields().then((v) => {
            if (!editTarget) return
            updateMut.mutate({
              id: editTarget.id,
              data: {
                ...v,
                planned_start: v.planned_start?.toISOString(),
                planned_end: v.planned_end?.toISOString(),
              },
            })
          })
        }
        confirmLoading={updateMut.isPending}
        width={480}
        okText="保存"
        cancelText="取消"
      >
        <Form form={editForm} layout="vertical">
          <Form.Item
            name="name"
            label="阶段名称"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select options={metaOptions(PHASE_STATUS_META)} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0 12px',
            }}
          >
            <Form.Item name="planned_start" label="计划开始">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="planned_end" label="计划结束">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  )
}
