import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Table, Tag, Space, Button, Input, Popconfirm, App } from 'antd'
import {
  EyeOutlined,
  DownloadOutlined,
  DeleteOutlined,
  LinkOutlined,
  SearchOutlined,
  FolderOpenOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { filesApi } from '../api'
import type { FileWithProject } from '../types'
import FilePreview from '../components/FilePreview'
import FileIcon from '../components/FileIcon'
import EmptyState from '../components/ui/EmptyState'
import { formatSize } from '../utils/format'

const { CheckableTag } = Tag

export default function FileLibrary() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [previewFile, setPreviewFile] = useState<FileWithProject | null>(null)

  const { data: files, isLoading } = useQuery({
    queryKey: ['files-all'],
    queryFn: filesApi.listAll,
  })

  const deleteMut = useMutation({
    mutationFn: filesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files-all'] })
      message.success('文件已删除')
    },
  })

  const handleDownload = async (file: FileWithProject) => {
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

  // D4: tag chips filter in addition to the text search
  const [activeTags, setActiveTags] = useState<string[]>([])
  const allTags = useMemo(
    () => Array.from(new Set((files ?? []).flatMap((f) => f.tags))).sort(),
    [files],
  )

  const filtered = files?.filter(
    (f) =>
      f.original_name.toLowerCase().includes(search.toLowerCase()) ||
      f.project_name.toLowerCase().includes(search.toLowerCase()) ||
      f.tags.some((t: string) =>
        t.toLowerCase().includes(search.toLowerCase()),
      ),
  )
  const visible = activeTags.length
    ? filtered?.filter((f) => activeTags.every((t) => f.tags.includes(t)))
    : filtered

  return (
    <div className="fade-in">
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-header__title">资料库</h1>
          <div className="page-header__sub">
            {files?.length ?? 0} 个文件 · 跨项目集中检索
          </div>
        </div>
      </div>

      <div className="table-toolbar">
        <Input
          placeholder="搜索文件名、项目名或标签…"
          allowClear
          prefix={<SearchOutlined style={{ color: 'var(--ink-3)' }} />}
          style={{ width: 320 }}
          onChange={(e) => setSearch(e.target.value)}
        />
        {allTags.length > 0 && (
          <Space size={[4, 4]} wrap style={{ marginLeft: 'var(--space-2)' }}>
            {allTags.map((t) => (
              <CheckableTag
                key={t}
                checked={activeTags.includes(t)}
                onChange={(checked: boolean) =>
                  setActiveTags((prev) =>
                    checked ? [...prev, t] : prev.filter((x) => x !== t),
                  )
                }
              >
                {t}
              </CheckableTag>
            ))}
            {activeTags.length > 0 && (
              <Button
                type="link"
                size="small"
                onClick={() => setActiveTags([])}
                aria-label="清除标签筛选"
              >
                清除筛选
              </Button>
            )}
          </Space>
        )}
      </div>

      <Table
        className="table-card"
        dataSource={visible}
        rowKey="id"
        size="small"
        loading={isLoading}
        pagination={{ pageSize: 20 }}
        scroll={{ x: 'max-content' }}
        columns={[
          {
            title: '文件名',
            dataIndex: 'original_name',
            key: 'original_name',
            ellipsis: true,
            render: (name: string, r: FileWithProject) => (
              <>
                <FileIcon
                  filename={r.original_name}
                  mimeType={r.mime_type}
                  sourceType={r.source_type}
                />{' '}
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
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setPreviewFile(r)
                    }}
                    className="table-link"
                    style={{ cursor: 'pointer' }}
                  >
                    {name}
                  </a>
                )}
              </>
            ),
          },
          {
            title: '所属项目',
            dataIndex: 'project_name',
            key: 'project_name',
            ellipsis: true,
            render: (name: string, r: FileWithProject) => (
              <a
                role="button"
                tabIndex={0}
                title={name}
                onClick={() => navigate(`/projects/${r.project_id}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') navigate(`/projects/${r.project_id}`)
                }}
                className="table-link"
                style={{ cursor: 'pointer' }}
              >
                {name}
              </a>
            ),
          },
          {
            title: '大小',
            dataIndex: 'file_size',
            key: 'file_size',
            width: 70,
            render: (s: number, r: FileWithProject) =>
              r.source_type === 'link' ? (
                <span className="table-dim">—</span>
              ) : (
                <span className="mono">{formatSize(s)}</span>
              ),
          },
          {
            title: '标签',
            dataIndex: 'tags',
            key: 'tags',
            width: 140,
            render: (tags: string[]) =>
              tags.map((t) => (
                <Tag key={t} style={{ marginBottom: 'var(--space-1)' }}>
                  {t}
                </Tag>
              )),
          },
          {
            title: '上传时间',
            dataIndex: 'created_at',
            key: 'created_at',
            width: 140,
            render: (v: string) => (
              <span className="mono">
                {dayjs(v).format('YYYY-MM-DD HH:mm')}
              </span>
            ),
          },
          {
            title: '',
            key: 'action',
            width: 110,
            render: (_: unknown, r: FileWithProject) => (
              <Space size={0}>
                {r.source_type === 'link' && r.url ? (
                  <Button
                    type="text"
                    size="small"
                    icon={<LinkOutlined />}
                    aria-label={`打开链接 ${r.original_name}`}
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
                      aria-label={`预览 ${r.original_name}`}
                      onClick={() => setPreviewFile(r)}
                    />
                    <Button
                      type="text"
                      size="small"
                      icon={<DownloadOutlined />}
                      aria-label={`下载 ${r.original_name}`}
                      onClick={() => handleDownload(r)}
                    />
                  </>
                )}
                <Popconfirm
                  title={
                    r.source_type === 'link' ? '删除该链接？' : '删除该文件？'
                  }
                  onConfirm={() => deleteMut.mutate(r.id)}
                >
                  <Button
                    type="text"
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    aria-label={`删除 ${r.original_name}`}
                  />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
        locale={{
          emptyText: (
            <EmptyState
              icon={<FolderOpenOutlined />}
              title="资料库中还没有文件"
              desc="在项目的「资料」标签页上传文件或添加在线链接。"
            />
          ),
        }}
      />

      <FilePreview
        file={previewFile}
        open={!!previewFile}
        onClose={() => setPreviewFile(null)}
      />
    </div>
  )
}
