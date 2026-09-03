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
  App,
} from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { issuesApi, peopleApi, communicationsApi } from '../api'
import type { IssueStatus, IssuePriority } from '../types'

const STATUS_OPTIONS = [
  { label: '待解决', value: 'open' },
  { label: '进行中', value: 'in_progress' },
  { label: '已解决', value: 'resolved' },
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

export default function IssuesTab({ projectId }: Props) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [issueOpen, setIssueOpen] = useState(false)
  const [issueForm] = Form.useForm()

  const { data: issues } = useQuery({
    queryKey: ['issues', projectId],
    queryFn: () => issuesApi.listByProject(projectId),
    enabled: !!projectId,
  })

  const { data: people } = useQuery({
    queryKey: ['people', projectId],
    queryFn: () => peopleApi.listByProject(projectId),
    enabled: !!projectId,
  })
  const teamPeople = (people ?? []).filter((p) => p.side === 'team')

  const { data: communications } = useQuery({
    queryKey: ['communications', projectId],
    queryFn: () => communicationsApi.listByProject(projectId),
    enabled: !!projectId,
  })

  const createIssueMut = useMutation({
    mutationFn: (v: {
      title: string
      description?: string
      status?: IssueStatus
      priority?: IssuePriority
      assignee_id?: string
      due_date?: string
      communication_id?: string
    }) => issuesApi.create(projectId, v),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issues', projectId] })
      message.success('问题已记录')
      setIssueOpen(false)
      issueForm.resetFields()
    },
  })

  const updateIssueMut = useMutation({
    mutationFn: ({
      issueId,
      data,
    }: {
      issueId: string
      data: Record<string, unknown>
    }) => issuesApi.update(issueId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issues', projectId] })
    },
  })

  const deleteIssueMut = useMutation({
    mutationFn: issuesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issues', projectId] })
      message.success('已删除')
    },
  })

  const columns = useMemo(
    () => [
      { title: '问题', dataIndex: 'title', key: 'title' },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 110,
        render: (s: IssueStatus, r: { id: string }) => (
          <Select
            size="small"
            value={s}
            style={{ width: 95 }}
            options={STATUS_OPTIONS}
            onChange={(val) =>
              updateIssueMut.mutate({ issueId: r.id, data: { status: val } })
            }
          />
        ),
      },
      {
        title: '优先级',
        dataIndex: 'priority',
        key: 'priority',
        width: 90,
        render: (p: IssuePriority, r: { id: string }) => (
          <Select
            size="small"
            value={p}
            style={{ width: 80 }}
            options={PRIORITY_OPTIONS}
            onChange={(val) =>
              updateIssueMut.mutate({ issueId: r.id, data: { priority: val } })
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
              updateIssueMut.mutate({
                issueId: r.id,
                data: { assignee_id: val ?? null },
              })
            }
          />
        ),
      },
      {
        title: '截止',
        dataIndex: 'due_date',
        key: 'due_date',
        width: 100,
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
      {
        title: '描述',
        dataIndex: 'description',
        key: 'description',
        ellipsis: true,
        render: (v: string | null) => v ?? '-',
      },
      {
        title: '操作',
        key: 'action',
        width: 70,
        render: (_: unknown, r: { id: string }) => (
          <Popconfirm
            title="删除该问题？"
            onConfirm={() => deleteIssueMut.mutate(r.id)}
          >
            <Button type="text" danger size="small" icon={<DeleteOutlined />} />
          </Popconfirm>
        ),
      },
    ],
    [teamPeople],
  )

  return (
    <div>
      <div className="tab-action">
        <Button icon={<PlusOutlined />} onClick={() => setIssueOpen(true)}>
          记录问题
        </Button>
      </div>
      <Table
        dataSource={issues}
        rowKey="id"
        size="small"
        pagination={false}
        scroll={{ x: 'max-content' }}
        columns={columns}
        locale={{ emptyText: '还没有记录的问题' }}
      />

      <Modal
        title="记录客户关切"
        open={issueOpen}
        onCancel={() => setIssueOpen(false)}
        onOk={() =>
          issueForm.validateFields().then((v) => {
            createIssueMut.mutate({
              ...v,
              due_date: v.due_date?.format('YYYY-MM-DD'),
            })
          })
        }
        confirmLoading={createIssueMut.isPending}
        width={480}
        okText="添加"
        cancelText="取消"
      >
        <Form form={issueForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="title"
            label="问题"
            rules={[{ required: true, message: '请输入问题' }]}
          >
            <Input placeholder="如：客户担心数据安全" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="status" label="状态" initialValue="open">
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
          <Form.Item name="communication_id" label="来源交流">
            <Select
              allowClear
              placeholder="可选，关联某次交流"
              options={(communications ?? []).map((c) => ({
                label: `${dayjs(c.occurred_at).format('MM-DD')} ${c.content.slice(0, 20)}`,
                value: c.id,
              }))}
            />
          </Form.Item>
          <Form.Item name="due_date" label="截止日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
