import { useState } from 'react'
import {
  Typography,
  Button,
  Tooltip,
  Tag,
  Space,
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  Popconfirm,
  App,
  Empty,
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  PaperClipOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { phasesApi, filesApi } from '../api'
import type { Phase, ProjectFile } from '../types'

const { Text } = Typography

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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: '待开始', color: 'var(--muted-hex)' },
  in_progress: { label: '进行中', color: 'var(--primary-hex)' },
  completed: { label: '已完成', color: '#2d8659' },
}

interface StandardPhaseTemplate {
  name: string
  description: string
  sort_order: number
}

const STANDARD_PHASES: StandardPhaseTemplate[] = [
  { name: '需求挖掘', description: '线索验证，确认客户真实需求', sort_order: 1 },
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
    mutationFn: ({ fileId, phaseId }: { fileId: string; phaseId: string | null }) =>
      filesApi.linkPhase(fileId, phaseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files', projectId] })
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
    const cfg = statusConfig[node.status] ?? {
      label: node.status,
      color: 'var(--muted-hex)',
    }
    const phaseFiles = (files ?? []).filter((f) => f.phase_id === node.id)
    const availableFiles = (files ?? []).filter((f) => !f.phase_id)
    return (
      <div key={node.id}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 12px',
            marginLeft: depth * 24,
            borderRadius: 8,
            background: depth === 0 ? 'rgba(var(--primary-rgb), 0.02)' : 'transparent',
            border: '1px solid var(--hairline)',
            marginBottom: 8,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: cfg.color,
              flexShrink: 0,
            }}
          />
          <Text strong>{node.name}</Text>
          <Tag
            style={{
              fontSize: 12,
              borderColor: 'transparent',
              background: `${cfg.color}15`,
              color: cfg.color,
            }}
          >
            {cfg.label}
          </Tag>
          {node.planned_start && (
            <Text type="secondary" style={{ fontSize: 13 }}>
              {dayjs(node.planned_start).format('MM/DD')}
              {node.planned_end &&
                ` → ${dayjs(node.planned_end).format('MM/DD')}`}
            </Text>
          )}
          {node.description && (
            <Text type="secondary" style={{ fontSize: 13 }}>
              {node.description}
            </Text>
          )}
          <Space style={{ marginLeft: 'auto' }}>
            <Button
              type="text"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => {
                setCreateOpen(true)
                form.setFieldsValue({ parent_id: node.id })
              }}
            />
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
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
            <Popconfirm
              title="删除该阶段？子阶段也会一起删除"
              onConfirm={() => deleteMut.mutate(node.id)}
            >
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
              />
            </Popconfirm>
          </Space>
        </div>

        {/* 阶段产物 */}
        <div
          style={{
            marginLeft: depth * 24 + 24,
            marginBottom: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
          }}
        >
          <PaperClipOutlined style={{ color: 'var(--muted-hex)', fontSize: 12 }} />
          {phaseFiles.map((f) => (
            <Tag
              key={f.id}
              closable
              onClose={(e) => {
                e.preventDefault()
                linkFileMut.mutate({ fileId: f.id, phaseId: null })
              }}
              style={{
                fontSize: 12,
                maxWidth: 200,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                cursor: 'default',
              }}
            >
              {f.source_type === 'link' ? (
                <a
                  href={f.url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  title={f.original_name}
                  style={{ color: 'inherit' }}
                >
                  🔗 {f.original_name}
                </a>
              ) : (
                <span
                  role="button"
                  tabIndex={0}
                  title={f.original_name}
                  onClick={(e) => {
                    e.stopPropagation()
                    onFilePreview?.(f)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onFilePreview?.(f)
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {f.original_name}
                  <Text
                    type="secondary"
                    style={{ fontSize: 11, marginLeft: 4 }}
                  >
                    {formatSize(f.file_size)}
                  </Text>
                </span>
              )}
            </Tag>
          ))}
          {availableFiles.length > 0 && (
            <Select
              size="small"
              placeholder="关联文件"
              variant="borderless"
              style={{ width: 140 }}
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
          {phaseFiles.length === 0 && availableFiles.length === 0 && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              暂无产物
            </Text>
          )}
        </div>

        {node.children.length > 0 && (
          <div>{node.children.map((child) => renderNode(child, depth + 1))}</div>
        )}
      </div>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Space>
          <Button
            icon={<PlusOutlined />}
            onClick={() => {
              setCreateOpen(true)
              form.resetFields()
            }}
          >
            添加阶段
          </Button>
          <Tooltip title="一键导入示例公司标准售前七阶段模板">
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
        </Space>
      </div>
      {tree.length > 0 ? (
        tree.map((node) => renderNode(node, 0))
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="还没有阶段规划"
        />
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
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="阶段名称"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="如：信息收集 / 漏洞利用" />
          </Form.Item>
          <Form.Item name="parent_id" label="父阶段" extra="不选则为顶级阶段">
            <Select
              allowClear
              placeholder="选择父阶段（可选）"
              options={phases?.map((p) => ({ label: p.name, value: p.id }))}
            />
          </Form.Item>
          <Form.Item name="status" label="状态" initialValue="pending">
            <Select
              options={Object.entries(statusConfig).map(([k, v]) => ({
                label: v.label,
                value: k,
              }))}
            />
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
              <DatePicker showTime style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="planned_end" label="计划结束">
              <DatePicker showTime style={{ width: '100%' }} />
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
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="阶段名称"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select
              options={Object.entries(statusConfig).map(([k, v]) => ({
                label: v.label,
                value: k,
              }))}
            />
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
              <DatePicker showTime style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="planned_end" label="计划结束">
              <DatePicker showTime style={{ width: '100%' }} />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  )
}
