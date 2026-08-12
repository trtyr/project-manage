import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Table,
  Tag,
  Input,
  Select,
  Modal,
  Popconfirm,
  Upload,
  Segmented,
  App,
  Space,
} from 'antd'
import type { UploadFile } from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  LinkOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { filesApi, communicationsApi, phasesApi } from '../api'
import type { ProjectFile } from '../types'
import FileIcon from './FileIcon'
import { formatSize } from '../utils/format'

interface Props {
  projectId: string
  onFilePreview?: (f: ProjectFile) => void
}

export default function FilesTab({ projectId, onFilePreview }: Props) {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const queryClient = useQueryClient()

  const [fileOpen, setFileOpen] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [fileDesc, setFileDesc] = useState('')
  const [fileTags, setFileTags] = useState<string[]>([])
  const [uploadMode, setUploadMode] = useState<'file' | 'link'>('file')
  const [linkUrl, setLinkUrl] = useState('')
  const [linkName, setLinkName] = useState('')

  const { data: files } = useQuery({
    queryKey: ['files', projectId],
    queryFn: () => filesApi.listByProject(projectId),
    enabled: !!projectId,
  })

  const { data: communications } = useQuery({
    queryKey: ['communications', projectId],
    queryFn: () => communicationsApi.listByProject(projectId),
    enabled: !!projectId,
  })

  const { data: phases } = useQuery({
    queryKey: ['phases', projectId],
    queryFn: () => phasesApi.listByProject(projectId),
    enabled: !!projectId,
  })

  const uploadFileMut = useMutation({
    mutationFn: async () => {
      if (uploadMode === 'link') {
        if (!linkUrl.trim()) throw new Error('no url')
        const tags = fileTags
        const result = await filesApi.createLink(projectId, {
          name: linkName.trim() || linkUrl.trim(),
          url: linkUrl.trim(),
          description: fileDesc || undefined,
          tags,
        })
        return [result]
      }
      if (selectedFiles.length === 0) throw new Error('no files')
      const tags = fileTags
      return Promise.all(
        selectedFiles.map((f) =>
          filesApi.upload(projectId, f, fileDesc || undefined, tags),
        ),
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files', projectId] })
      message.success(uploadMode === 'link' ? '链接已添加' : '文件已上传')
      setFileOpen(false)
      setSelectedFiles([])
      setFileDesc('')
      setFileTags([])
      setLinkUrl('')
      setLinkName('')
      setUploadMode('file')
    },
    onError: () =>
      message.error(uploadMode === 'link' ? '添加失败' : '上传失败'),
  })

  const deleteFileMut = useMutation({
    mutationFn: filesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files', projectId] })
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

  const columns = useMemo(
    () => [
      {
        title: '文件名',
        dataIndex: 'original_name',
        key: 'original_name',
        render: (name: string, r: ProjectFile) => (
          <Space>
            <FileIcon
              filename={r.original_name}
              mimeType={r.mime_type}
              sourceType={r.source_type}
            />
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
                onClick={() => onFilePreview?.(r)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onFilePreview?.(r)
                }}
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
        render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
      },
      {
        title: '来源',
        key: 'source',
        width: 140,
        render: (_: unknown, r: ProjectFile) => {
          if (!r.communication_id)
            return <span style={{ color: 'var(--muted-hex)' }}>直接上传</span>
          const comm = communications?.find((c) => c.id === r.communication_id)
          if (!comm)
            return <span style={{ color: 'var(--muted-hex)' }}>已关联</span>
          const preview = comm.content.slice(0, 12).replace(/\n/g, ' ')
          return (
            <a
              role="button"
              tabIndex={0}
              title={`${dayjs(comm.occurred_at).format('M月D日')}的沟通记录`}
              onClick={() =>
                navigate(
                  `/projects/${projectId}/communications/${r.communication_id}`,
                )
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter')
                  navigate(
                    `/projects/${projectId}/communications/${r.communication_id}`,
                  )
              }}
              style={{ cursor: 'pointer' }}
            >
              沟通 · {preview}
              {comm.content.length > 12 ? '…' : ''}
            </a>
          )
        },
      },
      {
        title: '阶段',
        key: 'phase',
        width: 120,
        render: (_: unknown, r: ProjectFile) => {
          if (!r.phase_id)
            return <span style={{ color: 'var(--muted-hex)' }}>-</span>
          const ph = phases?.find((p) => p.id === r.phase_id)
          return (
            <span title={ph?.description || ''}>{ph?.name ?? '未知阶段'}</span>
          )
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
                onClick={() =>
                  window.open(r.url!, '_blank', 'noopener,noreferrer')
                }
              />
            ) : (
              <>
                <Button
                  type="text"
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={() => onFilePreview?.(r)}
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
    ],
    [communications, phases, navigate, projectId, onFilePreview],
  )

  return (
    <div>
      <div className="tab-action">
        <Button icon={<PlusOutlined />} onClick={() => setFileOpen(true)}>
          上传文件
        </Button>
      </div>
      <Table
        dataSource={files}
        rowKey="id"
        size="small"
        pagination={false}
        columns={columns}
        locale={{ emptyText: '还没有上传文件' }}
      />

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
          setSelectedFiles([])
          setFileDesc('')
          setFileTags([])
          setLinkUrl('')
          setLinkName('')
          setUploadMode('file')
        }}
        onOk={() => uploadFileMut.mutate()}
        confirmLoading={uploadFileMut.isPending}
        okText={uploadMode === 'link' ? '添加' : '上传'}
        cancelText="取消"
        okButtonProps={{
          disabled:
            uploadMode === 'file'
              ? selectedFiles.length === 0
              : !linkUrl.trim(),
        }}
        width={480}
      >
        <div style={{ marginTop: 16 }}>
          {uploadMode === 'file' ? (
            <Upload.Dragger
              multiple
              beforeUpload={(file) => {
                setSelectedFiles((prev) => [...prev, file])
                return false
              }}
              onRemove={(file) =>
                setSelectedFiles((prev) =>
                  prev.filter((f) => f.name !== file.name),
                )
              }
              fileList={selectedFiles.map(
                (f, i) =>
                  ({
                    uid: `${i}`,
                    name: f.name,
                  }) as UploadFile,
              )}
            >
              <p style={{ margin: 0, color: 'var(--muted-hex)' }}>
                点击或拖拽文件到此处（可多选）
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
          <Select
            mode="tags"
            style={{ marginTop: 8, width: '100%' }}
            placeholder="标签（回车添加）"
            value={fileTags}
            onChange={setFileTags}
          />
        </div>
      </Modal>
    </div>
  )
}
