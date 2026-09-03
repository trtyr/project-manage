import { useState, useMemo } from 'react'
import {
  Button,
  Table,
  Select,
  Form,
  Input,
  DatePicker,
  Modal,
  Popconfirm,
  Space,
  App,
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { tasksApi, peopleApi } from '../api'
import type { Task, TaskStatus, TaskPriority } from '../types'

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
  const [editing, setEditing] = useState<Task | null>(null)
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
      setEditing(null)
      taskForm.resetFields()
    },
    onError: () => message.error('添加失败，请重试'),
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
    onError: () => message.error('更新失败，请重试'),
  })

  // B7 fix: tasks used to be create-only — no edit, no delete.
  const deleteTaskMut = useMutation({
    mutationFn: tasksApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] })
      message.success('已删除')
    },
    onError: () => message.error('删除失败，请重试'),
  })

  function openCreate() {
    setEditing(null)
    taskForm.resetFields()
    setTaskOpen(true)
  }

  function openEdit(t: Task) {
    setEditing(t)
    taskForm.setFieldsValue({
      ...t,
      planned_date: t.planned_date ? dayjs(t.planned_date) : null,
    })
    setTaskOpen(true)
  }

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
            // D2: guide to 成员 when the team side is empty
            notFoundContent={
              teamPeople.length === 0 ? (
                <span style={{ fontSize: 12, color: 'var(--muted-hex)' }}>
                  团队侧暂无成员——到「成员」页添加后可指派
                </span>
              ) : undefined
            }
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
            <span style={{ color: overdue ? 'var(--danger-hex)' : 'inherit' }}>
              {d.format('MM-DD')}
            </span>
          )
        },
      },
      {
        title: '操作',
        key: 'action',
        width: 80,
        render: (_: unknown, r: Task) => (
          <Space size={0}>
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              aria-label={`编辑任务 ${r.title}`}
              onClick={() => openEdit(r)}
            />
            <Popconfirm
              title="删除该任务？"
              onConfirm={() => deleteTaskMut.mutate(r.id)}
            >
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                aria-label={`删除任务 ${r.title}`}
              />
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [teamPeople],
  )

  return (
    <div>
      <div className="tab-action">
        <Button icon={<PlusOutlined />} onClick={openCreate}>
          添加任务
        </Button>
      </div>
      <Table
        dataSource={tasks}
        rowKey="id"
        size="small"
        pagination={false}
        scroll={{ x: 'max-content' }}
        columns={columns}
        locale={{
          emptyText:
            '还没有任务。把下一步要做的事记下来，用状态区分「待办 / 进行中 / 下一步」。',
        }}
      />

      <Modal
        title={editing ? '编辑任务' : '添加任务'}
        open={taskOpen}
        onCancel={() => {
          setTaskOpen(false)
          setEditing(null)
          taskForm.resetFields()
        }}
        onOk={() =>
          taskForm.validateFields().then((v) => {
            const data = {
              ...v,
              planned_date: v.planned_date?.format('YYYY-MM-DD'),
            }
            if (editing) {
              updateTaskMut.mutate({ taskId: editing.id, data })
              setTaskOpen(false)
              setEditing(null)
            } else {
              createTaskMut.mutate(data)
            }
          })
        }
        confirmLoading={createTaskMut.isPending || updateTaskMut.isPending}
        width={480}
        okText={editing ? '保存' : '添加'}
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
              notFoundContent={
                teamPeople.length === 0 ? (
                  <span style={{ fontSize: 12, color: 'var(--muted-hex)' }}>
                    团队侧暂无成员——到「成员」页添加后可指派
                  </span>
                ) : undefined
              }
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
