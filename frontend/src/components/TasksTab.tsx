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
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckSquareOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { tasksApi, peopleApi } from '../api'
import type { Task, TaskStatus, TaskPriority } from '../types'
import EmptyState from './ui/EmptyState'
import { TASK_STATUS_META, PRIORITY_META, metaOptions } from '../utils/status'

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

  // B7 fix: tasks used to be create-only — no edit, no delete.
  const deleteTaskMut = useMutation({
    mutationFn: tasksApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] })
      message.success('已删除')
    },
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
        width: 104,
        render: (s: TaskStatus, r: { id: string }) => (
          <Select
            className="cell-select"
            variant="borderless"
            size="small"
            value={s}
            style={{ width: 88 }}
            options={metaOptions(TASK_STATUS_META)}
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
        width: 88,
        render: (p: TaskPriority, r: { id: string }) => (
          <Select
            className="cell-select"
            variant="borderless"
            size="small"
            value={p}
            style={{ width: 72 }}
            options={metaOptions(PRIORITY_META)}
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
            className="cell-select"
            variant="borderless"
            size="small"
            value={aid ?? undefined}
            style={{ width: 100 }}
            allowClear
            placeholder={<span className="table-dim">未指派</span>}
            // D2: guide to 成员 when the team side is empty
            notFoundContent={
              teamPeople.length === 0 ? (
                <span className="table-dim" style={{ fontSize: 12 }}>
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
        width: 90,
        render: (v: string | null) => {
          if (!v) return <span className="table-dim">—</span>
          const d = dayjs(v)
          const overdue = d.isBefore(dayjs(), 'day')
          return (
            <span className={`mono ${overdue ? 'table-overdue' : ''}`}>
              {d.format('MM-DD')}
            </span>
          )
        },
      },
      {
        title: '',
        key: 'action',
        width: 76,
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
      <div className="table-toolbar">
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          添加任务
        </Button>
        <div className="table-toolbar__spacer" />
        {tasks?.length ? (
          <span className="mono" style={{ color: 'var(--ink-3)' }}>
            {tasks.length} 项
          </span>
        ) : null}
      </div>
      <Table
        className="table-card"
        dataSource={tasks}
        rowKey="id"
        size="small"
        pagination={false}
        scroll={{ x: 'max-content' }}
        columns={columns}
        locale={{
          emptyText: (
            <EmptyState
              icon={<CheckSquareOutlined />}
              title="还没有任务"
              desc="把下一步要做的事记下来，用状态区分「当前 / 下一步 / 待办」。"
            />
          ),
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
        <Form form={taskForm} layout="vertical">
          <Form.Item
            name="title"
            label="任务标题"
            rules={[{ required: true, message: '请输入任务标题' }]}
          >
            <Input placeholder="如：端口扫描" />
          </Form.Item>
          <Form.Item name="status" label="状态" initialValue="todo">
            <Select options={metaOptions(TASK_STATUS_META)} />
          </Form.Item>
          <Form.Item name="priority" label="优先级" initialValue="normal">
            <Select options={metaOptions(PRIORITY_META)} />
          </Form.Item>
          <Form.Item name="assignee_id" label="指派给">
            <Select
              allowClear
              placeholder="选择团队成员"
              notFoundContent={
                teamPeople.length === 0 ? (
                  <span className="table-dim" style={{ fontSize: 12 }}>
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
