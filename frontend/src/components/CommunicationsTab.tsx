import { useState } from 'react'
import {
  Button,
  Form,
  Input,
  Select,
  DatePicker,
  Modal,
  App,
} from 'antd'
import { PlusOutlined } from '@ant-design/icons'
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
          onClick={() => setCommOpen(true)}
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
        onCancel={() => setCommOpen(false)}
        onOk={() =>
          commForm.validateFields().then(async (v) => {
            const comm = await createCommMut.mutateAsync({
              ...v,
              occurred_at: v.occurred_at.toISOString(),
            })
            if (v.comm_file_ids?.length) {
              await Promise.all(
                v.comm_file_ids.map((fileId: string) =>
                  filesApi.link(fileId, comm.id),
                ),
              )
              queryClient.invalidateQueries({ queryKey: ['files', projectId] })
            }
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
          <Form.Item name="comm_file_ids" label="关联文件">
            <Select
              mode="multiple"
              placeholder="选择要关联的文件（可选）"
              options={files
                ?.filter((f) => !f.communication_id)
                .map((f) => ({
                  label: f.original_name,
                  value: f.id,
                }))}
              allowClear
              optionFilterProp="label"
              notFoundContent="暂无可关联的文件"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}