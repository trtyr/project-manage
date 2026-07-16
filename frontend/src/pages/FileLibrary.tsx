import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Table,
  Tag,
  Space,
  Button,
  Input,
  Popconfirm,
  App,
} from 'antd'
import {
  PaperClipOutlined,
  EyeOutlined,
  DownloadOutlined,
  DeleteOutlined,
  LinkOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { filesApi } from '../api'
import type { FileWithProject } from '../types'
import FilePreview from '../components/FilePreview'
import { formatSize } from '../utils/format'

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

  const filtered = files?.filter(
    (f) =>
      f.original_name.toLowerCase().includes(search.toLowerCase()) ||
      f.project_name.toLowerCase().includes(search.toLowerCase()) ||
      f.tags.some((t: string) => t.toLowerCase().includes(search.toLowerCase())),
  )

  return (
    <div className="fade-in">
      {/* Page header */}
      <div className="page-header">
        <div className="page-header__left">
          <h1 className="page-header__title">资料库</h1>
          <span className="page-header__count">{files?.length ?? 0} 个文件</span>
        </div>
      </div>

      <Input.Search
        placeholder="搜索文件名、项目名或标签…"
        allowClear
        size="large"
        style={{ marginBottom: 20, maxWidth: 400 }}
        onChange={(e) => setSearch(e.target.value)}
      />

      <Table
        dataSource={filtered}
        rowKey="id"
        size="small"
        loading={isLoading}
        pagination={{ pageSize: 20 }}
        columns={[
          {
            title: '文件名',
            dataIndex: 'original_name',
            key: 'original_name',
            render: (name: string, r: FileWithProject) => (
              <Space>
                {r.source_type === 'link' ? (
                  <LinkOutlined style={{ color: 'var(--muted-hex)' }} />
                ) : (
                  <PaperClipOutlined style={{ color: 'var(--muted-hex)' }} />
                )}
                {r.source_type === 'link' && r.url ? (
                  <a href={r.url} target="_blank" rel="noopener noreferrer" title={r.url}>
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
            title: '所属项目',
            dataIndex: 'project_name',
            key: 'project_name',
            render: (name: string, r: FileWithProject) => (
              <a
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/projects/${r.project_id}`)}
                onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/projects/${r.project_id}`) }}
                style={{ cursor: 'pointer' }}
              >{name}</a>
            ),
          },
          {
            title: '大小',
            dataIndex: 'file_size',
            key: 'file_size',
            width: 90,
            render: (s: number, r: FileWithProject) =>
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
            title: '上传时间',
            dataIndex: 'created_at',
            key: 'created_at',
            width: 140,
            render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
          },
          {
            title: '',
            key: 'action',
            width: 110,
            render: (_: unknown, r: FileWithProject) => (
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
                  onConfirm={() => deleteMut.mutate(r.id)}
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
        locale={{ emptyText: '资料库中还没有文件' }}
      />

      <FilePreview
        file={previewFile}
        open={!!previewFile}
        onClose={() => setPreviewFile(null)}
      />
    </div>
  )
}
