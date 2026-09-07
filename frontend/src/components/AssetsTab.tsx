import { useState, useMemo, useCallback } from 'react'
import {
  Button,
  Table,
  Form,
  Input,
  Select,
  Modal,
  Popconfirm,
  App,
  Space,
  Typography,
  Drawer,
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
  DatabaseOutlined,
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
import Pill from './ui/Pill'
import EmptyState from './ui/EmptyState'
import {
  CRED_TYPE_META,
  ASSET_TYPE_TONE,
  metaOptions,
  credTypeFields,
} from '../utils/status'

const { Text, Paragraph } = Typography

// Grouped asset-type suggestions: picking a domain first, then the exact
// type, keeps free-form values consistent across projects.
const ASSET_TYPE_GROUPS: { label: string; options: string[] }[] = [
  {
    label: '网络安全设备',
    options: ['防火墙', 'WAF', 'IDS/IPS', 'NDR', '蜜罐', '暴露面检测', '网闸'],
  },
  {
    label: '终端与数据安全',
    options: ['EDR', 'DLP', '零信任', '堡垒机', 'VPN', '沙箱', '终端管控'],
  },
  {
    label: '安全运营与监测',
    options: [
      'SOC',
      'SIEM',
      'SOAR',
      '威胁情报',
      '态势感知',
      '日志系统',
      '监控系统',
    ],
  },
  {
    label: '基础设施',
    options: [
      '服务器',
      '数据库',
      '云平台',
      '虚拟化',
      '容器',
      '备份系统',
      '域名',
    ],
  },
  {
    label: '应用与数据',
    options: ['应用', '数据管理系统', '中间件', 'OA/邮箱', '业务系统'],
  },
]

const ACCESS_METHODS = ['VPN', '直连', '拨号', '内网', '远程桌面']

// Vendor is free-form. Keep no hardcoded vendor list — avoids leaking any
// real vendor names into a public repo.
const VENDORS: string[] = []

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
      options={ASSET_TYPE_GROUPS.map((g) => ({
        label: g.label,
        options: g.options.map((t) => ({ label: t, value: t })),
      }))}
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
  const fields = credTypeFields(cred.cred_type)
  if (!cred.username && !cred.secret) {
    return <span className="info-dim">未填写账号或密钥</span>
  }
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {cred.username && (
        <div className="cred-field">
          <span className="cred-field__name">{fields.usernameLabel}</span>
          <span className="cred-field__value" title={cred.username}>
            {cred.username}
          </span>
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined />}
            aria-label={`复制${fields.usernameLabel} ${cred.label}`}
            onClick={() => onCopy(cred.username!)}
          />
        </div>
      )}
      {cred.secret && (
        <div className="cred-field">
          <span className="cred-field__name">{fields.secretLabel}</span>
          {show ? (
            <span
              className="cred-field__value cred-field__value--wrap"
              title={cred.secret}
            >
              {cred.secret}
            </span>
          ) : (
            <span className="cred-field__value" title="点击右侧眼睛图标显示">
              ••••••••••
            </span>
          )}
          <Button
            type="text"
            size="small"
            icon={show ? <EyeInvisibleOutlined /> : <EyeOutlined />}
            aria-label={
              show
                ? `隐藏${fields.secretLabel} ${cred.label}`
                : `显示${fields.secretLabel} ${cred.label}`
            }
            onClick={() => setShow((s) => !s)}
          />
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined />}
            aria-label={`复制${fields.secretLabel} ${cred.label}`}
            onClick={() => onCopy(cred.secret!)}
          />
        </div>
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
 * structured parts. Recognises 账号/用户名/user, AK/AccessKey, 密码/password
 * and SK/SecretKey lines. Returns [] when there is nothing to split
 * (fewer than 2 chunks). */
function parseCredentialChunks(
  blob: string,
): { label: string; username?: string; secret?: string }[] {
  const chunks = blob
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (chunks.length < 2) return []
  const USER =
    /^(?:账号|用户名|user(?:name)?|ak|access\s*key(?:\s*id)?)\s*[:：]\s*(.+)$/im
  const PASS =
    /^(?:密码|password|pass|sk|secret(?:\s*access)?\s*key)\s*[:：]\s*(.+)$/im
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

  // Field wording follows the selected type (AK/SK → Access Key ID/Secret…).
  const watchedType = Form.useWatch('cred_type', credForm) as string | undefined
  const formFields = credTypeFields(
    watchedType ?? editing?.cred_type ?? 'password',
  )

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
      title={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span>{asset?.name ?? ''}</span>
          {asset?.value && (
            <span className="mono" style={{ color: 'var(--ink-3)' }}>
              {asset.value}
            </span>
          )}
        </div>
      }
      open={open}
      onClose={onClose}
      width={560}
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
      {isLoading ? (
        <Text type="secondary">加载中…</Text>
      ) : credentials?.length ? (
        <div style={{ display: 'grid', gap: 12 }}>
          {credentials.map((c) => {
            const parts = parseCredentialChunks(c.secret ?? c.username ?? '')
            const typeMeta = CRED_TYPE_META[c.cred_type] ?? {
              label: c.cred_type,
              tone: 'neutral' as const,
            }
            return (
              <div key={c.id} className="cred-card">
                <div className="cred-card__head">
                  <span className="cred-card__label" title={c.label}>
                    {c.label}
                  </span>
                  <Pill small tone={typeMeta.tone}>
                    {typeMeta.label}
                  </Pill>
                  <span style={{ flex: 1 }} />
                  {parts.length >= 2 && (
                    <Tooltip title="按空行拆分为多条凭据">
                      <Button
                        type="text"
                        size="small"
                        icon={<ScissorOutlined />}
                        aria-label={`拆分凭据 ${c.label}`}
                        onClick={() => setSplitTarget(c)}
                      />
                    </Tooltip>
                  )}
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    aria-label={`编辑凭据 ${c.label}`}
                    onClick={() => openEdit(c)}
                  />
                  <Popconfirm
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
                  </Popconfirm>
                </div>
                <CredentialRows cred={c} onCopy={onCopy} />
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState
          icon={<KeyOutlined />}
          title="还没有凭据"
          desc="给这台资产的每个账号 / 密钥单独建一条，按类型区分。"
          action={
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={openCreate}
              disabled={!assetId}
            >
              添加凭据
            </Button>
          }
        />
      )}

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
        <p className="settings-section__desc" style={{ marginTop: 0 }}>
          按空行拆分为 {splitParts.length} 条独立凭据（无法识别的行归入密钥），
          原条目删除：
        </p>
        {splitParts.map((p, i) => (
          <div key={i} style={{ marginBottom: 8, fontSize: 13 }}>
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
        <Form form={credForm} layout="vertical">
          <Form.Item
            name="label"
            label="名称"
            rules={[{ required: true, message: '请输入名称，如 SSH root' }]}
          >
            <Input placeholder="如：SSH root / 后台管理员 / 云账号 AK" />
          </Form.Item>
          <Form.Item
            name="cred_type"
            label="类型"
            initialValue="password"
            extra={formFields.hint}
          >
            <Select options={metaOptions(CRED_TYPE_META)} />
          </Form.Item>
          <Form.Item name="username" label={formFields.usernameLabel}>
            <Input
              placeholder={formFields.usernamePlaceholder}
              autoComplete="off"
            />
          </Form.Item>
          <Form.Item name="secret" label={formFields.secretLabel}>
            <Input.TextArea
              rows={3}
              placeholder={formFields.secretPlaceholder}
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
        width: 32,
        render: () => (
          <HolderOutlined style={{ cursor: 'grab', color: 'var(--ink-3)' }} />
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
            <Pill small tone={ASSET_TYPE_TONE[t] ?? 'neutral'}>
              {t}
            </Pill>
          ) : (
            <span className="table-dim">—</span>
          ),
      },
      {
        title: '访问地址',
        dataIndex: 'value',
        key: 'value',
        width: 200,
        render: (v: string | null) => {
          if (!v) return <span className="table-dim">—</span>
          const isUrl = /^https?:\/\//.test(v)
          return (
            <Space size={0} style={{ minWidth: 0 }}>
              {isUrl ? (
                <a
                  href={v}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mono table-link"
                  style={{
                    display: 'inline-block',
                    maxWidth: 220,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    verticalAlign: 'middle',
                  }}
                >
                  {v}
                </a>
              ) : (
                <span
                  className="mono"
                  title={v}
                  style={{
                    display: 'inline-block',
                    maxWidth: 220,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    verticalAlign: 'middle',
                  }}
                >
                  {v}
                </span>
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
        width: 88,
        render: (v: string | null) =>
          v ? <Pill small>{v}</Pill> : <span className="table-dim">—</span>,
      },
      {
        title: '凭据',
        key: 'credentials',
        width: 96,
        render: (_: unknown, r: Asset) => (
          <Button
            type="text"
            size="small"
            icon={<KeyOutlined />}
            className={`table-link ${r.credential_count > 0 ? '' : 'table-dim'}`}
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
        render: (v: string | null) => v ?? <span className="table-dim">—</span>,
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
            <span className="table-dim">—</span>
          ),
      },
      {
        title: '',
        key: 'action',
        width: 76,
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
      <div className="table-toolbar">
        <Button
          type="primary"
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
          <Space style={{ marginLeft: 'var(--space-2)' }}>
            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: 'var(--ink-3)' }} />}
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
        <div className="table-toolbar__spacer" />
        {assets?.length ? (
          <span className="mono" style={{ color: 'var(--ink-3)' }}>
            {assets.length} 台
          </span>
        ) : null}
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
            className="table-card"
            dataSource={filteredAssets}
            rowKey="id"
            size="small"
            pagination={false}
            scroll={{ x: 'max-content' }}
            columns={columns}
            components={{ body: { row: SortableRow } }}
            locale={{
              emptyText: filtersActive ? (
                <EmptyState
                  icon={<SearchOutlined />}
                  title="没有匹配的资产"
                  desc="换个关键词，或清除类型筛选后再试。"
                />
              ) : (
                <EmptyState
                  icon={<DatabaseOutlined />}
                  title="还没有记录资产"
                  desc="把账号、平台入口、凭据集中登记在这里。"
                />
              ),
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
        <Form form={assetForm} layout="vertical">
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
