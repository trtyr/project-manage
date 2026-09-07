import { useState, useMemo } from 'react'
import {
  Button,
  Table,
  Form,
  Input,
  Select,
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
  SendOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { deliverablesApi, filesApi } from '../api'
import type { Deliverable } from '../types/generated/Deliverable'
import EmptyState from './ui/EmptyState'
import Pill from './ui/Pill'
import { DELIVERABLE_STATUS_META, metaOptions } from '../utils/status'

interface Props {
  projectId: string
}

export default function DeliverablesTab({ projectId }: Props) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Deliverable | null>(null)
  const [form] = Form.useForm()

  const { data: deliverables } = useQuery({
    queryKey: ['deliverables', projectId],
    queryFn: () => deliverablesApi.listByProject(projectId),
    enabled: !!projectId,
  })

  const { data: files } = useQuery({
    queryKey: ['files', projectId],
    queryFn: () => filesApi.listByProject(projectId),
    enabled: !!projectId,
  })

  const createMut = useMutation({
    mutationFn: (data: Parameters<typeof deliverablesApi.create>[1]) =>
      deliverablesApi.create(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deliverables', projectId] })
      message.success('交付物已添加')
      setOpen(false)
      form.resetFields()
    },
  })

  const updateMut = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string
      data: Parameters<typeof deliverablesApi.update>[1]
    }) => deliverablesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deliverables', projectId] })
      message.success('已保存')
      setEditing(null)
      form.resetFields()
    },
  })

  const deleteMut = useMutation({
    mutationFn: deliverablesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deliverables', projectId] })
      message.success('已删除')
    },
  })

  const columns = useMemo(
    () => [
      { title: '交付物', dataIndex: 'name', key: 'name' },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 104,
        render: (s: string, r: Deliverable) => (
          <Select
            className="cell-select"
            variant="borderless"
            size="small"
            value={s}
            style={{ width: 88 }}
            options={metaOptions(DELIVERABLE_STATUS_META)}
            onChange={(val: string) =>
              updateMut.mutate({
                id: r.id,
                data: { status: val as 'pending' | 'delivered' | 'accepted' },
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
        title: '关联文件',
        dataIndex: 'linked_file_id',
        key: 'linked_file_id',
        render: (fid: string | null) => {
          if (!fid) return <span className="table-dim">—</span>
          const f = files?.find((x) => x.id === fid)
          return f ? <Pill small>{f.original_name}</Pill> : '—'
        },
      },
      {
        title: '',
        key: 'action',
        width: 76,
        render: (_: unknown, r: Deliverable) => (
          <Space size={0}>
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              aria-label={`编辑交付物 ${r.name}`}
              onClick={() => {
                setEditing(r)
                // B3 fix: DatePicker expects a Dayjs — a raw 'YYYY-MM-DD'
                // string renders empty and crashes .format() on save.
                form.setFieldsValue({
                  ...r,
                  due_date: r.due_date ? dayjs(r.due_date) : null,
                })
                setOpen(true)
              }}
            />
            <Popconfirm title="删除？" onConfirm={() => deleteMut.mutate(r.id)}>
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                aria-label={`删除交付物 ${r.name}`}
              />
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [files],
  )

  return (
    <div>
      <div className="table-toolbar">
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            setEditing(null)
            form.resetFields()
            setOpen(true)
          }}
        >
          添加交付物
        </Button>
        <div className="table-toolbar__spacer" />
        {deliverables?.length ? (
          <span className="mono" style={{ color: 'var(--ink-3)' }}>
            {deliverables.length} 项
          </span>
        ) : null}
      </div>
      <Table
        className="table-card"
        dataSource={deliverables}
        rowKey="id"
        size="small"
        pagination={false}
        scroll={{ x: 'max-content' }}
        columns={columns}
        locale={{
          emptyText: (
            <EmptyState
              icon={<SendOutlined />}
              title="还没有交付物"
              desc="每个阶段的产出文件挂在这里，形成验收清单。"
            />
          ),
        }}
      />

      <Modal
        title={editing ? '编辑交付物' : '添加交付物'}
        open={open}
        onCancel={() => {
          setOpen(false)
          setEditing(null)
          form.resetFields()
        }}
        onOk={() =>
          form.validateFields().then((v) => {
            const data = { ...v, due_date: v.due_date?.format('YYYY-MM-DD') }
            if (editing) {
              updateMut.mutate({ id: editing.id, data })
            } else {
              createMut.mutate(data)
            }
          })
        }
        confirmLoading={createMut.isPending || updateMut.isPending}
        width={480}
        okText={editing ? '保存' : '添加'}
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="交付物名称"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="如：验收报告 v1" />
          </Form.Item>
          <Form.Item name="status" label="状态" initialValue="pending">
            <Select options={metaOptions(DELIVERABLE_STATUS_META)} />
          </Form.Item>
          {/* D7: 关联文件 moved above 截止日期 — real usage is a
              file-linked deliverables list (3/3 linked, 0/3 dated), so
              the date is secondary. */}
          <Form.Item name="linked_file_id" label="关联文件">
            <Select
              allowClear
              placeholder="选择已上传的文件（可选）"
              options={(files ?? []).map((f) => ({
                label: f.original_name,
                value: f.id,
              }))}
            />
          </Form.Item>
          <Form.Item name="due_date" label="截止日期（可选）">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
