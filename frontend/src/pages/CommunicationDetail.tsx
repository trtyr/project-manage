import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Button,
  Skeleton,
  Empty,
  Tag,
  Space,
  Modal,
  Form,
  DatePicker,
  Input,
  App,
  Popconfirm,
  Upload,
} from 'antd'
import {
  ArrowLeftOutlined,
  EditOutlined,
  DeleteOutlined,
  PaperClipOutlined,
  UploadOutlined,
  EyeOutlined,
  DownloadOutlined,
  LinkOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import Markdown from '../components/Markdown'
import ParticipantsInput from '../components/ParticipantsInput'
import FilePreview from '../components/FilePreview'
import { communicationsApi, filesApi } from '../api'
import { formatSize } from '../utils/format'
import type { UpdateCommunication, ProjectFile } from '../types'

export default function CommunicationDetail() {
  const { id, commId } = useParams<{ id: string; commId: string }>()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)
  const [editForm] = Form.useForm()
  const [previewFile, setPreviewFile] = useState<ProjectFile | null>(null)

  const { data: comm, isLoading } = useQuery({
    queryKey: ['communication', commId],
    queryFn: () => communicationsApi.get(commId!),
    enabled: !!commId,
  })

  const { data: files } = useQuery({
    queryKey: ['files', id],
    queryFn: () => filesApi.listByProject(id!),
    enabled: !!id,
  })

  const updateMut = useMutation({
    mutationFn: (data: { cid: string; body: UpdateCommunication }) =>
      communicationsApi.update(data.cid, data.body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['communication', commId] })
      queryClient.invalidateQueries({ queryKey: ['communications', id] })
      message.success('已更新')
      setEditOpen(false)
      editForm.resetFields()
    },
  })

  const deleteMut = useMutation({
    mutationFn: () => communicationsApi.delete(commId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['communications', id] })
      message.success('已删除')
      navigate(`/projects/${id}`)
    },
  })

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const uploaded = await filesApi.upload(id!, file)
      await filesApi.link(uploaded.id, commId!)
      return uploaded
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files', id] })
      message.success('文件已上传并关联到本记录')
    },
    onError: () => message.error('上传失败，请重试'),
  })

  const deleteFileMut = useMutation({
    mutationFn: filesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files', id] })
      message.success('文件已删除')
    },
    onError: () => message.error('删除失败'),
  })

  const handleDownload = async (f: ProjectFile) => {
    try {
      const blob = await filesApi.download(f.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = f.original_name
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      message.error('下载失败')
    }
  }

  if (isLoading) {
    return (
      <div className="reading-layout" style={{ padding: 24 }}>
        <Skeleton active paragraph={{ rows: 10 }} />
      </div>
    )
  }

  if (!comm) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Empty description="记录不存在" />
        <Button
          onClick={() => navigate(`/projects/${id}`)}
          style={{ marginTop: 16 }}
        >
          返回项目
        </Button>
      </div>
    )
  }

  const participants = (comm.participants || '')
    .split(/[,，、;；]/)
    .map((s) => s.trim())
    .filter(Boolean)

  const linkedFiles = files?.filter((f) => f.communication_id === commId) ?? []

  return (
    <div className="comm-detail-wrap fade-in">
      {/* 主内容区 */}
      <div className="comm-detail-main">
        <div className="reading-header">
          <div>
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate(`/projects/${id}`)}
              className="back-btn"
            >
              返回项目
            </Button>
            <span className="reading-date">
              {dayjs(comm.occurred_at).format('YYYY年M月D日 HH:mm')}
            </span>
          </div>
        </div>

        {/* 参与人 */}
        {participants.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            {participants.map((p) => (
              <Tag key={p} className="tag-participant">
                {p}
              </Tag>
            ))}
          </div>
        )}

        {/* 正文 */}
        <div className="md-render" style={{ marginBottom: 32 }}>
          <Markdown>{comm.content}</Markdown>
        </div>

        {/* 结论 */}
        {comm.conclusion && (
          <div className="comm-conclusion">
            <span className="comm-conclusion__label">结论</span>
            <div className="md-render">
              <Markdown>{comm.conclusion}</Markdown>
            </div>
          </div>
        )}
      </div>

      {/* 右侧悬浮面板 */}
      <aside className="comm-detail-aside">
        <div className="comm-aside-section">
          <Space>
            <Button
              icon={<EditOutlined />}
              onClick={() => {
                editForm.setFieldsValue({
                  occurred_at: dayjs(comm.occurred_at),
                  content: comm.content,
                  participants: comm.participants || undefined,
                  conclusion: comm.conclusion || undefined,
                })
                setEditOpen(true)
              }}
            >
              编辑
            </Button>
            <Popconfirm
              title="删除此记录？"
              okText="删除"
              cancelText="取消"
              onConfirm={() => deleteMut.mutate()}
            >
              <Button danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          </Space>
        </div>

        <div className="comm-aside-section">
          <div className="comm-files-header">
            <span className="comm-conclusion__label">
              <PaperClipOutlined /> 关联文件
              {linkedFiles.length > 0 && `（${linkedFiles.length}）`}
            </span>
          </div>
          <Upload
            multiple
            showUploadList={false}
            beforeUpload={(file) => {
              uploadMut.mutate(file)
              return false
            }}
          >
            <Button
              size="small"
              icon={<UploadOutlined />}
              loading={uploadMut.isPending}
            >
              上传文件
            </Button>
          </Upload>
          {linkedFiles.length > 0 ? (
            <div className="comm-aside-files__list">
              {linkedFiles.map((f) => {
                const isLink = f.source_type === 'link' && f.url
                return (
                  <div key={f.id} className="comm-file-item">
                    <div
                      className="comm-file-item__main"
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        isLink
                          ? window.open(f.url!, '_blank', 'noopener,noreferrer')
                          : setPreviewFile(f)
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter')
                          isLink
                            ? window.open(
                                f.url!,
                                '_blank',
                                'noopener,noreferrer',
                              )
                            : setPreviewFile(f)
                      }}
                    >
                      {isLink ? (
                        <LinkOutlined className="comm-file-item__icon" />
                      ) : (
                        <PaperClipOutlined className="comm-file-item__icon" />
                      )}
                      <div className="comm-file-item__info">
                        <span
                          className="comm-file-item__name"
                          title={f.original_name}
                        >
                          {f.original_name}
                        </span>
                        <span className="comm-file-item__size">
                          {isLink ? '在线链接' : formatSize(f.file_size)}
                        </span>
                      </div>
                    </div>
                    <div className="comm-file-item__actions">
                      {isLink ? (
                        <Button
                          type="text"
                          size="small"
                          icon={<LinkOutlined />}
                          onClick={() =>
                            window.open(f.url!, '_blank', 'noopener,noreferrer')
                          }
                        />
                      ) : (
                        <>
                          <Button
                            type="text"
                            size="small"
                            icon={<EyeOutlined />}
                            onClick={() => setPreviewFile(f)}
                          />
                          <Button
                            type="text"
                            size="small"
                            icon={<DownloadOutlined />}
                            onClick={() => handleDownload(f)}
                          />
                        </>
                      )}
                      <Popconfirm
                        title={isLink ? '确定删除此链接？' : '确定删除此文件？'}
                        okText="删除"
                        cancelText="取消"
                        onConfirm={() => deleteFileMut.mutate(f.id)}
                      >
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                        />
                      </Popconfirm>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="comm-aside-files__empty">暂无关联文件</div>
          )}
        </div>
      </aside>

      {/* 编辑 Modal */}
      <Modal
        title="编辑沟通记录"
        open={editOpen}
        onCancel={() => {
          setEditOpen(false)
          editForm.resetFields()
        }}
        onOk={() =>
          editForm.validateFields().then((v) => {
            updateMut.mutate({
              cid: commId!,
              body: {
                content: v.content,
                occurred_at: v.occurred_at.toISOString(),
                participants: v.participants || null,
                conclusion: v.conclusion || null,
              },
            })
          })
        }
        confirmLoading={updateMut.isPending}
        width="100%"
        centered
        styles={{ body: { height: '85vh', overflow: 'auto' } }}
        okText="保存"
        cancelText="取消"
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="occurred_at"
            label="沟通时间"
            rules={[{ required: true, message: '请选择时间' }]}
          >
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="content"
            label="沟通内容"
            rules={[{ required: true, message: '请输入内容' }]}
          >
            <Input.TextArea rows={12} />
          </Form.Item>
          <Form.Item name="participants" label="参与人">
            <ParticipantsInput />
          </Form.Item>
          <Form.Item name="conclusion" label="结论">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 文件预览 */}
      <FilePreview
        file={previewFile}
        open={!!previewFile}
        onClose={() => setPreviewFile(null)}
      />
    </div>
  )
}
