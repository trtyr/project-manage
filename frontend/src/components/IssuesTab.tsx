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
  WarningOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { issuesApi, peopleApi, communicationsApi } from '../api'
import type { Issue, IssueStatus, IssuePriority } from '../types'
import EmptyState from './ui/EmptyState'
import { ISSUE_STATUS_META, PRIORITY_META, metaOptions } from '../utils/status'

interface Props {
  projectId: string
}

export default function IssuesTab({ projectId }: Props) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [issueOpen, setIssueOpen] = useState(false)
  const [editing, setEditing] = useState<Issue | null>(null)
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
        width: 104,
        render: (s: IssueStatus, r: { id: string }) => (
          <Select
            className="cell-select"
            variant="borderless"
            size="small"
            value={s}
            style={{ width: 88 }}
            options={metaOptions(ISSUE_STATUS_META)}
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
        width: 88,
        render: (p: IssuePriority, r: { id: string }) => (
          <Select
            className="cell-select"
            variant="borderless"
            size="small"
            value={p}
            style={{ width: 72 }}
            options={metaOptions(PRIORITY_META)}
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
        title: '描述',
        dataIndex: 'description',
        key: 'description',
        ellipsis: true,
        render: (v: string | null) => v ?? <span className="table-dim">—</span>,
      },
      {
        title: '',
        key: 'action',
        width: 76,
        render: (_: unknown, r: Issue) => (
          <Space size={0}>
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              aria-label={`编辑问题 ${r.title}`}
              onClick={() => {
                // B8 fix: issues were create-only; edit converts due_date for
                // the DatePicker (same pattern as PhasesTab).
                setEditing(r)
                issueForm.setFieldsValue({
                  ...r,
                  due_date: r.due_date ? dayjs(r.due_date) : null,
                })
                setIssueOpen(true)
              }}
            />
            <Popconfirm
              title="删除该问题？"
              onConfirm={() => deleteIssueMut.mutate(r.id)}
            >
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                aria-label={`删除问题 ${r.title}`}
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
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            setEditing(null)
            issueForm.resetFields()
            setIssueOpen(true)
          }}
        >
          记录问题
        </Button>
        <div className="table-toolbar__spacer" />
        {issues?.length ? (
          <span className="mono" style={{ color: 'var(--ink-3)' }}>
            {issues.length} 项
          </span>
        ) : null}
      </div>
      <Table
        className="table-card"
        dataSource={issues}
        rowKey="id"
        size="small"
        pagination={false}
        scroll={{ x: 'max-content' }}
        columns={columns}
        locale={{
          emptyText: (
            <EmptyState
              icon={<WarningOutlined />}
              title="还没有客户关切"
              desc="客户在会上提的顾虑、待跟进的问题，随手记一条避免遗忘。"
            />
          ),
        }}
      />

      <Modal
        title={editing ? '编辑客户关切' : '记录客户关切'}
        open={issueOpen}
        onCancel={() => {
          setIssueOpen(false)
          setEditing(null)
          issueForm.resetFields()
        }}
        onOk={() =>
          issueForm.validateFields().then((v) => {
            const data = {
              ...v,
              due_date: v.due_date?.format('YYYY-MM-DD'),
            }
            if (editing) {
              updateIssueMut.mutate({ issueId: editing.id, data })
              setIssueOpen(false)
              setEditing(null)
            } else {
              createIssueMut.mutate(data)
            }
          })
        }
        confirmLoading={createIssueMut.isPending || updateIssueMut.isPending}
        width={480}
        okText={editing ? '保存' : '添加'}
        cancelText="取消"
      >
        <Form form={issueForm} layout="vertical">
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
            <Select options={metaOptions(ISSUE_STATUS_META)} />
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
