import { useState } from 'react'
import {
  Button,
  Table,
  Select,
  Form,
  Input,
  DatePicker,
  Modal,
  App,
} from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tasksApi } from '../api'
import type { TaskStatus } from '../types'

interface Props {
  projectId: string
}

export default function TasksTab({ projectId }: Props) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [taskOpen, setTaskOpen] = useState(false)
  const [taskForm] = Form.useForm()

  const { data: tasks } = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: () => tasksApi.listByProject(projectId),
    enabled: !!projectId,
  })

  const createTaskMut = useMutation({
    mutationFn: (v: {
      title: string
      status?: TaskStatus
      planned_date?: string
    }) => tasksApi.create(projectId, v),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] })
      message.success('任务已添加')
      setTaskOpen(false)
      taskForm.resetFields()
    },
  })

  const updateTaskMut = useMutation({
    mutationFn: ({
      taskId,
      data,
    }: {
      taskId: string
      data: { status?: TaskStatus }
    }) => tasksApi.update(taskId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] })
    },
  })

  return (
    <div>
      <div className="tab-action">
        <Button icon={<PlusOutlined />} onClick={() => setTaskOpen(true)}>
          添加任务
        </Button>
      </div>
      <Table
        dataSource={tasks}
        rowKey="id"
        size="small"
        pagination={false}
        columns={[
          { title: '任务', dataIndex: 'title', key: 'title' },
          {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            width: 120,
            render: (s: TaskStatus, r: { id: string }) => (
              <Select
                size="small"
                value={s}
                style={{ width: 100 }}
                options={[
                  { label: '当前', value: 'current' },
                  { label: '下一步', value: 'next' },
                  { label: '待办', value: 'todo' },
                ]}
                onChange={(val) =>
                  updateTaskMut.mutate({
                    taskId: r.id,
                    data: { status: val },
                  })
                }
              />
            ),
          },
          {
            title: '计划日期',
            dataIndex: 'planned_date',
            key: 'planned_date',
            width: 120,
            render: (v: string | null) => v ?? '-',
          },
        ]}
        locale={{ emptyText: '还没有任务' }}
      />

      <Modal
        title="添加任务"
        open={taskOpen}
        onCancel={() => setTaskOpen(false)}
        onOk={() =>
          taskForm.validateFields().then((v) => {
            createTaskMut.mutate({
              ...v,
              planned_date: v.planned_date?.format('YYYY-MM-DD'),
            })
          })
        }
        confirmLoading={createTaskMut.isPending}
        width={480}
        okText="添加"
        cancelText="取消"
      >
        <Form form={taskForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="title"
            label="任务标题"
            rules={[{ required: true, message: '请输入任务标题' }]}
          >
            <Input placeholder="如：端口扫描" />
          </Form.Item>
          <Form.Item name="status" label="状态" initialValue="todo">
            <Select
              options={[
                { label: '当前', value: 'current' },
                { label: '下一步', value: 'next' },
                { label: '待办', value: 'todo' },
              ]}
            />
          </Form.Item>
          <Form.Item name="planned_date" label="计划日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
