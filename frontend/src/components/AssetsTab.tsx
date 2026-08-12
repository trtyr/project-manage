import { useState, useMemo, useCallback } from 'react'
import {
  Button,
  Table,
  Tag,
  Form,
  Input,
  Select,
  Modal,
  Popconfirm,
  App,
  Space,
  Typography,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CopyOutlined,
  HolderOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { assetsApi } from '../api'
import type { Asset } from '../types'

const { Text, Paragraph } = Typography

const ASSET_TYPE_SUGGESTIONS = [
  '监控系统',
  '数据管理系统',
  '日志系统',
  'SOAR',
  'NDR',
  '防火墙',
  '网关',
  'IDS/IPS',
  '威胁情报',
  '暴露面检测',
  '访问控制',
  'VPN',
  '运维终端',
  '服务器',
  '域名',
  '数据库',
  '云平台',
]

const ASSET_TYPE_COLOR: Record<string, string> = {
  监控系统: 'blue',
  数据管理系统: 'purple',
  威胁情报: 'cyan',
  暴露面检测: 'orange',
  访问控制: 'green',
  防火墙: 'red',
  网关: 'volcano',
  日志系统: 'geekblue',
  SOAR: 'magenta',
  NDR: 'gold',
}

const ACCESS_METHODS = ['访问控制登录', 'VPN', '直连', '运维终端', '拨号', '内网']

const VENDORS = [
  '示例厂商',
  '示例厂商',
  '示例厂商',
  '示例厂商',
  '示例厂商',
  '示例厂商',
  '示例厂商',
  '示例公司',
]

function assetTypeColor(t: string | null | undefined): string {
  return (t && ASSET_TYPE_COLOR[t]) || 'default'
}

interface SelectProps {
  value?: string
  onChange?: (v: string) => void
}

function AssetTypeSelect({ value, onChange }: SelectProps) {
  return (
    <Select
      mode="tags"
      maxCount={1}
      value={value ? [value] : []}
      placeholder="选择或自由填写类型"
      options={ASSET_TYPE_SUGGESTIONS.map((t) => ({ label: t, value: t }))}
      onChange={(s) => onChange?.(s[s.length - 1] ?? '')}
    />
  )
}

function AccessMethodSelect({ value, onChange }: SelectProps) {
  return (
    <Select
      mode="tags"
      maxCount={1}
      value={value ? [value] : []}
      placeholder="选择或自由填写"
      options={ACCESS_METHODS.map((m) => ({ label: m, value: m }))}
      onChange={(s) => onChange?.(s[s.length - 1] ?? '')}
    />
  )
}

function VendorSelect({ value, onChange }: SelectProps) {
  return (
    <Select
      mode="tags"
      maxCount={1}
      value={value ? [value] : []}
      placeholder="选择或自由填写"
      options={VENDORS.map((v) => ({ label: v, value: v }))}
      onChange={(s) => onChange?.(s[s.length - 1] ?? '')}
    />
  )
}

/** Credentials: masked, click to open in a modal (secure + multi-line friendly). */
function SecretText({ value }: { value: string | null | undefined }) {
  const { message } = App.useApp()
  const [open, setOpen] = useState(false)
  if (!value) return <Text type="secondary">-</Text>

  return (
    <>
      <Button type="link" size="small" onClick={() => setOpen(true)}>
        ••••••
      </Button>
      <Modal
        title="凭据"
        open={open}
        onCancel={() => setOpen(false)}
        footer={
          <Button
            icon={<CopyOutlined />}
            onClick={() =>
              navigator.clipboard.writeText(value).then(
                () => message.success('已复制'),
                () => message.error('复制失败'),
              )
            }
          >
            复制
          </Button>
        }
        width={480}
      >
        <Paragraph
          style={{
            whiteSpace: 'pre-wrap',
            margin: 0,
            fontFamily: 'var(--font-mono)',
          }}
        >
          {value}
        </Paragraph>
      </Modal>
    </>
  )
}

interface Props {
  projectId: string
}

/** Draggable table row for dnd-kit + AntD Table integration. */
function SortableRow(
  props: React.HTMLAttributes<HTMLTableRowElement> & { 'data-row-key': string },
) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props['data-row-key'] })
  const style: React.CSSProperties = {
    ...props.style,
    transform: CSS.Transform.toString(transform),
    transition,
    cursor: 'move',
    ...(isDragging ? { position: 'relative', zIndex: 99 } : {}),
  }
  return (
    <tr
      {...props}
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
    />
  )
}

export default function AssetsTab({ projectId }: Props) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [assetOpen, setAssetOpen] = useState(false)
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null)
  const [assetForm] = Form.useForm()

  const { data: assets } = useQuery({
    queryKey: ['assets', projectId],
    queryFn: () => assetsApi.listByProject(projectId),
    enabled: !!projectId,
  })

  const createAssetMut = useMutation({
    mutationFn: (data: Parameters<typeof assetsApi.create>[1]) =>
      assetsApi.create(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets', projectId] })
      message.success('资产已添加')
      setAssetOpen(false)
      setEditingAsset(null)
      assetForm.resetFields()
    },
  })

  const deleteAssetMut = useMutation({
    mutationFn: assetsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets', projectId] })
      message.success('已删除')
    },
  })

  const updateAssetMut = useMutation({
    mutationFn: (data: {
      aid: string
      body: Parameters<typeof assetsApi.update>[1]
    }) => assetsApi.update(data.aid, data.body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets', projectId] })
      message.success('资产已更新')
      setAssetOpen(false)
      setEditingAsset(null)
      assetForm.resetFields()
    },
  })

  const copy = useCallback(
    (text: string) => {
      navigator.clipboard.writeText(text).then(
        () => message.success('已复制'),
        () => message.error('复制失败'),
      )
    },
    [message],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = (assets ?? []).map((a) => a.id)
    const oldIndex = ids.indexOf(String(active.id))
    const newIndex = ids.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    const reordered = arrayMove(assets ?? [], oldIndex, newIndex)
    queryClient.setQueryData(['assets', projectId], reordered)
    try {
      await assetsApi.reorder(
        projectId,
        reordered.map((a) => a.id),
      )
    } catch {
      message.error('排序保存失败，已还原')
      queryClient.invalidateQueries({ queryKey: ['assets', projectId] })
    }
  }

  const columns = useMemo(
    () => [
      {
        title: '',
        key: 'drag',
        width: 36,
        render: () => (
          <HolderOutlined
            style={{ cursor: 'grab', color: 'var(--muted-hex)' }}
          />
        ),
      },
      { title: '名称', dataIndex: 'name', key: 'name', width: 150 },
      {
        title: '类型',
        dataIndex: 'asset_type',
        key: 'asset_type',
        width: 100,
        render: (t: string | null) =>
          t ? (
            <Tag color={assetTypeColor(t)}>{t}</Tag>
          ) : (
            <Text type="secondary">-</Text>
          ),
      },
      {
        title: '访问地址',
        dataIndex: 'value',
        key: 'value',
        width: 200,
        render: (v: string | null) => {
          if (!v) return <Text type="secondary">-</Text>
          const isUrl = /^https?:\/\//.test(v)
          return (
            <Space size={2}>
              {isUrl ? (
                <Text
                  ellipsis
                  style={{ maxWidth: 160, verticalAlign: 'middle' }}
                >
                  <a href={v} target="_blank" rel="noopener noreferrer">
                    {v}
                  </a>
                </Text>
              ) : (
                <Text
                  ellipsis
                  style={{ maxWidth: 160, verticalAlign: 'middle' }}
                >
                  {v}
                </Text>
              )}
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined />}
                onClick={() => copy(v)}
              />
            </Space>
          )
        },
      },
      {
        title: '访问方式',
        dataIndex: 'access_method',
        key: 'access_method',
        width: 100,
        render: (v: string | null) =>
          v ? <Tag>{v}</Tag> : <Text type="secondary">-</Text>,
      },
      {
        title: '凭据',
        dataIndex: 'credentials',
        key: 'credentials',
        width: 120,
        render: (v: string | null) => <SecretText value={v} />,
      },
      {
        title: '厂商',
        dataIndex: 'vendor',
        key: 'vendor',
        width: 80,
        render: (v: string | null) => v ?? <Text type="secondary">-</Text>,
      },
      {
        title: '描述',
        dataIndex: 'description',
        key: 'description',
        render: (v: string | null) =>
          v ? (
            <Paragraph
              style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}
              ellipsis={{ rows: 2, expandable: true, symbol: '展开' }}
            >
              {v}
            </Paragraph>
          ) : (
            <Text type="secondary">-</Text>
          ),
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
                  access_method: r.access_method,
                  credentials: r.credentials,
                  vendor: r.vendor,
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
    ],
    [copy],
  )

  return (
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
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={(assets ?? []).map((a) => a.id)}
          strategy={verticalListSortingStrategy}
        >
          <Table
            dataSource={assets}
            rowKey="id"
            size="small"
            pagination={false}
            columns={columns}
            components={{ body: { row: SortableRow } }}
            locale={{ emptyText: '还没有记录资产' }}
          />
        </SortableContext>
      </DndContext>

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
        width={520}
        okText={editingAsset ? '保存' : '添加'}
        cancelText="取消"
      >
        <Form form={assetForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="名称"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="如：示例厂商 监控系统 / OA 服务器" />
          </Form.Item>
          <Form.Item name="asset_type" label="类型">
            <AssetTypeSelect />
          </Form.Item>
          <Form.Item name="value" label="访问地址 / 值">
            <Input placeholder="https://... 或 IP / 域名" />
          </Form.Item>
          <Form.Item name="access_method" label="访问方式">
            <AccessMethodSelect />
          </Form.Item>
          <Form.Item name="credentials" label="凭据">
            <Input.TextArea
              rows={3}
              placeholder="账号 / 密码 / API Key（保存后在列表会掩码显示）"
            />
          </Form.Item>
          <Form.Item name="vendor" label="厂商">
            <VendorSelect />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="其他备注（换行可分段）" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
