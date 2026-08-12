import { useState, useMemo } from 'react'
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
import dayjs from 'dayjs'
import { tasksApi, peopleApi } from '../api'
import type { TaskStatus, TaskPriority } from '../types'

const STATUS_OPTIONS = [
  { label: '当前', value: 'current' },
  { label: '下一步', value: 'next' },
  { label: '待办', value: 'todo' },
]

const PRIORITY_OPTIONS = [
  { label: '紧急', value: 'urgent' },
  { label: '高', value: 'high' },
  { label: '正常', value: 'normal' },
  { label: '低', value: 'low' },
]

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

  const { data: people } = useQuery({
    queryKey: ['people', projectId],
    queryFn: () => peopleApi.listByProject(projectId),
    enabled: !!projectId,
  })
  const teamPeople = (people ?? []).filter((p) => p.side === 'team')

  const createTaskMut = useMutation({
    mutationFn: (v: {
      title: string
      status?: TaskStatus
      planned_date?: string
      assignee_id?: string
      priority?: TaskPriority
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
      data: Record<string, unknown>
    }) => tasksApi.update(taskId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] })
    },
  })

  const columns = useMemo(
    () => [
      { title: '任务', dataIndex: 'title', key: 'title' },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 110,
        render: (s: TaskStatus, r: { id: string }) => (
          <Select
            size="small"
            value={s}
            style={{ width: 95 }}
            options={STATUS_OPTIONS}
            onChange={(val) =>
              updateTaskMut.mutate({ taskId: r.id, data: { status: val } })
            }
          />
        ),
      },
      {
        title: '优先级',
        dataIndex: 'priority',
        key: 'priority',
        width: 90,
        render: (p: TaskPriority, r: { id: string }) => (
          <Select
            size="small"
            value={p}
            style={{ width: 80 }}
            options={PRIORITY_OPTIONS}
            onChange={(val) =>
              updateTaskMut.mutate({ taskId: r.id, data: { priority: val } })
            }
          />
        ),
      },
      {
        title: '指派',
        dataIndex: 'assignee_id',
        key: 'assignee_id',
        width: 120,
        render: (aid: string | null, r: { id: string }) => (
          <Select
            size="small"
            value={aid ?? undefined}
            style={{ width: 110 }}
            allowClear
            placeholder="指派"
            options={teamPeople.map((p) => ({ label: p.name, value: p.id }))}
            onChange={(val) =>
              updateTaskMut.mutate({
                taskId: r.id,
                data: { assignee_id: val ?? null },
              })
            }
          />
        ),
      },
      {
        title: '截止',
        dataIndex: 'planned_date',
        key: 'planned_date',
        width: 110,
        render: (v: string | null) => {
          if (!v) return <span style={{ color: 'var(--muted-hex)' }}>-</span>
          const d = dayjs(v)
          const overdue = d.isBefore(dayjs(), 'day')
          return (
            <span style={{ color: overdue ? '#ff4d4f' : 'inherit' }}>
              {d.format('MM-DD')}
            </span>
          )
        },
      },
    ],
    [teamPeople],
  )

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
        columns={columns}
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
            <Select options={STATUS_OPTIONS} />
          </Form.Item>
          <Form.Item name="priority" label="优先级" initialValue="normal">
            <Select options={PRIORITY_OPTIONS} />
          </Form.Item>
          <Form.Item name="assignee_id" label="指派给">
            <Select
              allowClear
              placeholder="选择团队成员"
              options={teamPeople.map((p) => ({ label: p.name, value: p.id }))}
            />
          </Form.Item>
          <Form.Item name="planned_date" label="截止日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
