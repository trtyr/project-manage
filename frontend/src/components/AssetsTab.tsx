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
  Drawer,
  List,
  Tooltip,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CopyOutlined,
  HolderOutlined,
  KeyOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  ScissorOutlined,
  SearchOutlined,
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
import { assetsApi, assetCredentialsApi } from '../api'
import type {
  Asset,
  AssetCredential,
  CreateAssetCredential,
  UpdateAssetCredential,
} from '../types'

const { Text, Paragraph } = Typography

const ASSET_TYPE_SUGGESTIONS = [
  '防火墙',
  'WAF',
  'IDS/IPS',
  'NDR',
  'EDR',
  'DLP',
  'SOC',
  'SIEM',
  'SOAR',
  '威胁情报',
  '暴露面检测',
  '蜜罐',
  '零信任',
  '堡垒机',
  'VPN',
  '网关',
  '监控系统',
  '日志系统',
  '数据库',
  '服务器',
  '应用',
  '数据管理系统',
  '域名',
  '云平台',
]

const ASSET_TYPE_COLOR: Record<string, string> = {
  监控系统: 'blue',
  数据管理系统: 'purple',
  威胁情报: 'cyan',
  暴露面检测: 'orange',
  应用: 'green',
  防火墙: 'red',
  网关: 'volcano',
  日志系统: 'geekblue',
  SOAR: 'magenta',
  NDR: 'gold',
  EDR: 'geekblue',
  DLP: 'gold',
  SOC: 'blue',
  SIEM: 'purple',
  零信任: 'cyan',
  堡垒机: 'red',
  WAF: 'volcano',
  蜜罐: 'magenta',
}

const ACCESS_METHODS = ['VPN', '直连', '拨号', '内网', '远程桌面']

const CRED_TYPES: { value: string; label: string }[] = [
  { value: 'password', label: '密码' },
  { value: 'api_key', label: 'API Key' },
  { value: 'certificate', label: '证书/密钥' },
  { value: 'token', label: '令牌' },
  { value: 'other', label: '其他' },
]

const CRED_TYPE_COLOR: Record<string, string> = {
  password: 'blue',
  api_key: 'purple',
  certificate: 'gold',
  token: 'cyan',
  other: 'default',
}

function credTypeLabel(t: string | null | undefined): string {
  return CRED_TYPES.find((x) => x.value === t)?.label ?? t ?? '其他'
}

function credTypeColor(t: string | null | undefined): string {
  return (t && CRED_TYPE_COLOR[t]) || 'default'
}

// Vendor is free-form. Keep no hardcoded vendor list — avoids leaking any
// real vendor names into a public repo.
const VENDORS: string[] = []

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

/** One credential's username/secret rows — each field copies separately,
 * secrets stay masked until the eye toggle is clicked. */
function CredentialRows({
  cred,
  onCopy,
}: {
  cred: AssetCredential
  onCopy: (text: string) => void
}) {
  const [show, setShow] = useState(false)
  if (!cred.username && !cred.secret) {
    return <Text type="secondary">未填写账号或密钥</Text>
  }
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      {cred.username && (
        <Space size={4}>
          <Text type="secondary">账号</Text>
          <Text
            code
            style={{
              maxWidth: 260,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {cred.username}
          </Text>
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined />}
            aria-label={`复制账号 ${cred.label}`}
            onClick={() => onCopy(cred.username!)}
          />
        </Space>
      )}
      {cred.secret && (
        <Space size={4}>
          <Text type="secondary">密钥</Text>
          {show ? (
            <Text
              code
              style={{
                maxWidth: 260,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                maxHeight: 120,
                overflowY: 'auto',
              }}
            >
              {cred.secret}
            </Text>
          ) : (
            <Text code>••••••••</Text>
          )}
          <Button
            type="text"
            size="small"
            icon={show ? <EyeInvisibleOutlined /> : <EyeOutlined />}
            aria-label={
              show ? `隐藏密钥 ${cred.label}` : `显示密钥 ${cred.label}`
            }
            onClick={() => setShow((s) => !s)}
          />
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined />}
            aria-label={`复制密钥 ${cred.label}`}
            onClick={() => onCopy(cred.secret!)}
          />
        </Space>
      )}
    </div>
  )
}

interface CredentialDrawerProps {
  projectId: string
  asset: Asset | null
  open: boolean
  onClose: () => void
  onCopy: (text: string) => void
}

/** Parse a migrated multi-account blob (blank-line separated chunks) into
 * structured parts. Recognises 账号/用户名/user and 密码/password lines.
 * Returns [] when there is nothing to split (fewer than 2 chunks). */
function parseCredentialChunks(
  blob: string,
): { label: string; username?: string; secret?: string }[] {
  const chunks = blob
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (chunks.length < 2) return []
  const USER = /^(?:账号|用户名|user(?:name)?)\s*[:：]\s*(.+)$/im
  const PASS = /^(?:密码|password|pass)\s*[:：]\s*(.+)$/im
  return chunks.map((chunk, i) => {
    const username = chunk.match(USER)?.[1]?.trim()
    const pass = chunk.match(PASS)?.[1]?.trim()
    const rest = chunk
      .split('\n')
      .filter((l) => !USER.test(l) && !PASS.test(l))
      .join('\n')
      .trim()
    const label =
      username || (chunk.split('\n')[0] || `凭据 ${i + 1}`).slice(0, 24)
    return { label, username, secret: pass ?? (rest || undefined) }
  })
}

/** Manage one asset's credentials: list + add/edit/delete, each entry with
 * a typed label and separately copyable username / secret. */
function CredentialDrawer({
  projectId,
  asset,
  open,
  onClose,
  onCopy,
}: CredentialDrawerProps) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [credForm] = Form.useForm()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<AssetCredential | null>(null)
  const [splitTarget, setSplitTarget] = useState<AssetCredential | null>(null)
  const [splitting, setSplitting] = useState(false)
  const assetId = asset?.id ?? ''

  const { data: credentials, isLoading } = useQuery({
    queryKey: ['asset-credentials', assetId],
    queryFn: () => assetCredentialsApi.listByAsset(projectId, assetId),
    enabled: open && !!assetId,
  })

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['asset-credentials', assetId] })
    // The asset row carries a read-only credential_count.
    queryClient.invalidateQueries({ queryKey: ['assets', projectId] })
  }, [queryClient, assetId, projectId])

  function closeForm() {
    setFormOpen(false)
    setEditing(null)
    credForm.resetFields()
  }

  const createMut = useMutation({
    mutationFn: (body: CreateAssetCredential) =>
      assetCredentialsApi.create(projectId, assetId, body),
    onSuccess: () => {
      invalidate()
      message.success('凭据已添加')
      closeForm()
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateAssetCredential }) =>
      assetCredentialsApi.update(id, body),
    onSuccess: () => {
      invalidate()
      message.success('凭据已更新')
      closeForm()
    },
  })

  const deleteMut = useMutation({
    mutationFn: assetCredentialsApi.delete,
    onSuccess: () => {
      invalidate()
      message.success('已删除')
    },
  })

  function openCreate() {
    setEditing(null)
    credForm.resetFields()
    setFormOpen(true)
  }

  function openEdit(c: AssetCredential) {
    setEditing(c)
    credForm.setFieldsValue({
      label: c.label,
      cred_type: c.cred_type,
      username: c.username ?? '',
      secret: c.secret ?? '',
    })
    setFormOpen(true)
  }

  const splitParts = splitTarget
    ? parseCredentialChunks(splitTarget.secret ?? splitTarget.username ?? '')
    : []

  /** Split a migrated blob: create one structured credential per chunk,
   * then drop the original row. */
  async function doSplit() {
    if (!splitTarget || splitParts.length < 2) return
    setSplitting(true)
    try {
      for (const p of splitParts) {
        await assetCredentialsApi.create(projectId, assetId, {
          label: p.label,
          cred_type: splitTarget.cred_type,
          username: p.username,
          secret: p.secret,
        })
      }
      await assetCredentialsApi.delete(splitTarget.id)
      invalidate()
      message.success(`已拆分为 ${splitParts.length} 条凭据`)
      setSplitTarget(null)
    } catch {
      message.error('拆分失败，请手动处理')
    } finally {
      setSplitting(false)
    }
  }

  function submit() {
    credForm.validateFields().then((v) => {
      // Empty strings stay absent so untouched fields never overwrite data.
      const body = {
        label: v.label,
        cred_type: v.cred_type || 'password',
        username: v.username || undefined,
        secret: v.secret || undefined,
      }
      if (editing) {
        updateMut.mutate({ id: editing.id, body })
      } else {
        createMut.mutate(body as CreateAssetCredential)
      }
    })
  }

  return (
    <Drawer
      title={`凭据 · ${asset?.name ?? ''}`}
      open={open}
      onClose={onClose}
      width={520}
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={openCreate}
          disabled={!assetId}
        >
          添加凭据
        </Button>
      }
    >
      <List
        loading={isLoading}
        dataSource={credentials ?? []}
        locale={{
          emptyText: '还没有凭据。给这台资产的每个账号 / 密钥单独建一条。',
        }}
        renderItem={(c) => {
          const parts = parseCredentialChunks(c.secret ?? c.username ?? '')
          return (
            <List.Item
              actions={[
                ...(parts.length >= 2
                  ? [
                      <Tooltip key="split" title="按空行拆分为多条凭据">
                        <Button
                          type="text"
                          size="small"
                          icon={<ScissorOutlined />}
                          aria-label={`拆分凭据 ${c.label}`}
                          onClick={() => setSplitTarget(c)}
                        />
                      </Tooltip>,
                    ]
                  : []),
                <Button
                  key="edit"
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  aria-label={`编辑凭据 ${c.label}`}
                  onClick={() => openEdit(c)}
                />,
                <Popconfirm
                  key="delete"
                  title="删除该凭据？"
                  onConfirm={() => deleteMut.mutate(c.id)}
                >
                  <Button
                    type="text"
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    aria-label={`删除凭据 ${c.label}`}
                  />
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space size={6}>
                    <span>{c.label}</span>
                    <Tag color={credTypeColor(c.cred_type)}>
                      {credTypeLabel(c.cred_type)}
                    </Tag>
                  </Space>
                }
                description={<CredentialRows cred={c} onCopy={onCopy} />}
              />
            </List.Item>
          )
        }}
      />

      <Modal
        title={`拆分「${splitTarget?.label ?? ''}」`}
        open={!!splitTarget}
        onCancel={() => setSplitTarget(null)}
        onOk={doSplit}
        confirmLoading={splitting}
        okText={`拆分为 ${splitParts.length} 条`}
        cancelText="取消"
        width={480}
      >
        <Paragraph type="secondary">
          按空行拆分为 {splitParts.length} 条独立凭据（无法识别的行归入密钥），
          原条目删除：
        </Paragraph>
        {splitParts.map((p, i) => (
          <div key={i} style={{ marginBottom: 8 }}>
            <Text strong>
              {i + 1}. {p.label}
            </Text>
            {p.username && <Text type="secondary"> · 账号 {p.username}</Text>}
            {p.secret && <Text type="secondary"> · 密钥已解析</Text>}
          </div>
        ))}
      </Modal>

      <Modal
        title={editing ? '编辑凭据' : '添加凭据'}
        open={formOpen}
        onCancel={closeForm}
        onOk={submit}
        confirmLoading={createMut.isPending || updateMut.isPending}
        okText={editing ? '保存' : '添加'}
        cancelText="取消"
        width={440}
      >
        <Form form={credForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="label"
            label="名称"
            rules={[{ required: true, message: '请输入名称，如 SSH root' }]}
          >
            <Input placeholder="如：SSH root / 后台管理员" />
          </Form.Item>
          <Form.Item name="cred_type" label="类型" initialValue="password">
            <Select
              options={CRED_TYPES.map((t) => ({
                label: t.label,
                value: t.value,
              }))}
            />
          </Form.Item>
          <Form.Item name="username" label="账号">
            <Input
              placeholder="用户名 / 账号 ID（无则留空）"
              autoComplete="off"
            />
          </Form.Item>
          <Form.Item name="secret" label="密钥">
            <Input.TextArea
              rows={3}
              placeholder="密码 / 密钥体 / 令牌（无则留空）"
              autoComplete="off"
            />
          </Form.Item>
        </Form>
      </Modal>
    </Drawer>
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
  const [credentialAsset, setCredentialAsset] = useState<Asset | null>(null)
  const [filterText, setFilterText] = useState('')
  const [filterType, setFilterType] = useState<string | null>(null)
  const [assetForm] = Form.useForm()

  const { data: assets } = useQuery({
    queryKey: ['assets', projectId],
    queryFn: () => assetsApi.listByProject(projectId),
    enabled: !!projectId,
  })

  const assetTypes = useMemo(
    () => [...new Set((assets ?? []).map((a) => a.asset_type))].sort(),
    [assets],
  )

  const filtersActive = !!filterType || !!filterText.trim()
  const filteredAssets = useMemo(() => {
    const kw = filterText.trim().toLowerCase()
    return (assets ?? []).filter((a) => {
      if (filterType && a.asset_type !== filterType) return false
      if (!kw) return true
      return [a.name, a.value, a.description, a.vendor].some((f) =>
        (f ?? '').toLowerCase().includes(kw),
      )
    })
  }, [assets, filterText, filterType])

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
    if (filtersActive) {
      // A filtered subset can't express a full-list order — reordering
      // while filtering would silently corrupt sort_order.
      message.warning('筛选中不可拖拽排序，请先清除筛选')
      return
    }
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
                  style={{ maxWidth: 220, verticalAlign: 'middle' }}
                >
                  <a href={v} target="_blank" rel="noopener noreferrer">
                    {v}
                  </a>
                </Text>
              ) : (
                <Text
                  ellipsis
                  style={{ maxWidth: 220, verticalAlign: 'middle' }}
                >
                  {v}
                </Text>
              )}
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined />}
                aria-label={`复制 ${v}`}
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
        key: 'credentials',
        width: 110,
        render: (_: unknown, r: Asset) => (
          <Button
            type="link"
            size="small"
            icon={<KeyOutlined />}
            onClick={() => setCredentialAsset(r)}
          >
            {r.credential_count > 0 ? `${r.credential_count} 条` : '登记'}
          </Button>
        ),
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
              aria-label={`编辑资产 ${r.name}`}
              onClick={() => {
                setEditingAsset(r)
                assetForm.setFieldsValue({
                  name: r.name,
                  asset_type: r.asset_type,
                  value: r.value,
                  access_method: r.access_method,
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
                aria-label={`删除资产 ${r.name}`}
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
        {(assets?.length ?? 0) > 1 && (
          <Space style={{ marginLeft: 'var(--space-3)' }}>
            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: 'var(--muted-hex)' }} />}
              placeholder="搜名称 / 地址 / 描述"
              style={{ width: 220 }}
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
            />
            <Select
              allowClear
              placeholder="全部类型"
              style={{ minWidth: 140 }}
              value={filterType ?? undefined}
              onChange={(v) => setFilterType(v ?? null)}
              options={assetTypes.map((t) => ({ label: t, value: t }))}
            />
          </Space>
        )}
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={filteredAssets.map((a) => a.id)}
          strategy={verticalListSortingStrategy}
        >
          <Table
            dataSource={filteredAssets}
            rowKey="id"
            size="small"
            pagination={false}
            scroll={{ x: 'max-content' }}
            columns={columns}
            components={{ body: { row: SortableRow } }}
            locale={{
              emptyText: filtersActive
                ? '没有匹配筛选条件的资产。'
                : '还没有记录资产。把账号、平台入口、凭据集中登记在这里。',
            }}
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
            <Input placeholder="如：OA 服务器 / 数据库" />
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
          <Form.Item name="vendor" label="厂商">
            <VendorSelect />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="其他备注（换行可分段）" />
          </Form.Item>
        </Form>
      </Modal>

      <CredentialDrawer
        projectId={projectId}
        asset={credentialAsset}
        open={!!credentialAsset}
        onClose={() => setCredentialAsset(null)}
        onCopy={copy}
      />
    </div>
  )
}
