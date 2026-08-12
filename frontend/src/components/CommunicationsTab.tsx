import { useState } from 'react'
import {
  Button,
  Form,
  Input,
  Select,
  DatePicker,
  Modal,
  App,
  Upload,
  Tag,
  Divider,
  Space,
} from 'antd'
import { PlusOutlined, InboxOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { communicationsApi, filesApi } from '../api'
import type { ProjectFile } from '../types'
import CommunicationList from './CommunicationList'
import ParticipantsInput from './ParticipantsInput'

interface Props {
  projectId: string
  onFilePreview?: (f: ProjectFile) => void
}

export default function CommunicationsTab({ projectId }: Props) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [commOpen, setCommOpen] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<ProjectFile[]>([])
  const [commForm] = Form.useForm()

  const { data: communications } = useQuery({
    queryKey: ['communications', projectId],
    queryFn: () => communicationsApi.listByProject(projectId),
    enabled: !!projectId,
  })

  const { data: files } = useQuery({
    queryKey: ['files', projectId],
    queryFn: () => filesApi.listByProject(projectId),
    enabled: !!projectId,
  })

  const createCommMut = useMutation({
    mutationFn: (v: {
      content: string
      occurred_at: string
      participants?: string
      conclusion?: string
    }) => communicationsApi.create(projectId, v),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['communications', projectId] })
      message.success('沟通记录已添加')
      setCommOpen(false)
      commForm.resetFields()
    },
  })

  return (
    <div>
      <div className="tab-action">
        <Button
          icon={<PlusOutlined />}
          onClick={() => {
            // Defensive reset so a previously-cancelled session cannot leak
            // pending uploads into a fresh modal.
            setPendingFiles([])
            setCommOpen(true)
          }}
        >
          添加沟通记录
        </Button>
      </div>
      <CommunicationList
        communications={communications}
        projectId={projectId}
        files={files}
      />

      <Modal
        title="添加沟通记录"
        open={commOpen}
        onCancel={() => {
          // Best-effort cleanup: delete any files uploaded during this
          // session that the user is now abandoning. State is reset first
          // so the cleanup logic reads a consistent snapshot.
          if (pendingFiles.length > 0) {
            const orphans = pendingFiles
            setPendingFiles([])
            Promise.allSettled(orphans.map((f) => filesApi.delete(f.id))).then(
              (results) => {
                const failed = results.filter((r) => r.status === 'rejected')
                if (failed.length) {
                  message.warning(
                    `有 ${failed.length} 个文件未能清理，请到文件管理中处理`,
                  )
                }
              },
            )
          }
          commForm.resetFields()
          setCommOpen(false)
        }}
        onOk={() =>
          commForm.validateFields().then(async (v) => {
            const comm = await createCommMut.mutateAsync({
              ...v,
              occurred_at: v.occurred_at.toISOString(),
            })

            // Collect all file IDs: pending uploads + selected existing files
            const allFileIds = [
              ...pendingFiles.map((f) => f.id),
              ...(v.comm_file_ids ?? []),
            ]

            if (allFileIds.length) {
              await Promise.all(
                allFileIds.map((fileId: string) =>
                  filesApi.link(fileId, comm.id),
                ),
              )
              queryClient.invalidateQueries({ queryKey: ['files', projectId] })
            }

            setPendingFiles([]) // reset after successful submit
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
          <Form.Item label="关联文件">
            <Space direction="vertical" style={{ width: '100%' }}>
              {/* Primary: Direct upload */}
              <Upload.Dragger
                multiple
                showUploadList={false}
                beforeUpload={(file) => {
                  filesApi
                    .upload(projectId, file)
                    .then((result) => {
                      setPendingFiles((prev) => [...prev, result])
                      message.success(`${file.name} 上传成功`)
                    })
                    .catch(() => message.error(`${file.name} 上传失败`))
                  return false // prevent default upload behavior
                }}
                accept="*"
              >
                <p className="ant-upload-drag-icon">
                  <InboxOutlined />
                </p>
                <p className="ant-upload-text">点击或拖拽文件到此处上传</p>
                <p className="ant-upload-hint">
                  上传后的文件将自动关联到本次沟通记录
                </p>
              </Upload.Dragger>

              {/* Show uploaded files */}
              {pendingFiles.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  {pendingFiles.map((f) => (
                    <Tag
                      key={f.id}
                      closable
                      onClose={async (e) => {
                        e.preventDefault()
                        try {
                          await filesApi.delete(f.id)
                          setPendingFiles((prev) =>
                            prev.filter((p) => p.id !== f.id),
                          )
                          message.success(`${f.original_name} 已移除`)
                        } catch {
                          message.error('移除失败')
                        }
                      }}
                      style={{ marginBottom: 4 }}
                    >
                      {f.original_name}
                    </Tag>
                  ))}
                </div>
              )}

              {/* Secondary: existing unlinked files — only show if there are any */}
              {files && files.filter((f) => !f.communication_id).length > 0 && (
                <>
                  <Divider style={{ margin: '12px 0' }}>
                    或从已有文件中选择
                  </Divider>
                  <Form.Item name="comm_file_ids" noStyle>
                    <Select
                      mode="multiple"
                      placeholder="选择已上传的文件"
                      options={files
                        ?.filter((f) => !f.communication_id)
                        .map((f) => ({
                          label: f.original_name,
                          value: f.id,
                        }))}
                      allowClear
                      optionFilterProp="label"
                    />
                  </Form.Item>
                </>
              )}
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
