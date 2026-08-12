import { useState, useMemo } from 'react'
import {
  Button,
  Table,
  Tag,
  Form,
  Input,
  Select,
  DatePicker,
  Modal,
  Popconfirm,
  App,
  Space,
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { deliverablesApi, filesApi } from '../api'
import type { Deliverable } from '../types/generated/Deliverable'

const STATUS_OPTIONS = [
  { label: '待交付', value: 'pending' },
  { label: '已交付', value: 'delivered' },
  { label: '已验收', value: 'accepted' },
]

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
        width: 100,
        render: (s: string, r: Deliverable) => (
          <Select
            size="small"
            value={s}
            style={{ width: 90 }}
            options={STATUS_OPTIONS}
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
        title: '关联文件',
        dataIndex: 'linked_file_id',
        key: 'linked_file_id',
        render: (fid: string | null) => {
          if (!fid) return <span style={{ color: 'var(--muted-hex)' }}>-</span>
          const f = files?.find((x) => x.id === fid)
          return f ? <Tag>{f.original_name}</Tag> : '-'
        },
      },
      {
        title: '',
        key: 'action',
        width: 90,
        render: (_: unknown, r: Deliverable) => (
          <Space size={0}>
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => {
                setEditing(r)
                form.setFieldsValue(r)
                setOpen(true)
              }}
            />
            <Popconfirm title="删除？" onConfirm={() => deleteMut.mutate(r.id)}>
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
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
      <div className="tab-action">
        <Button
          icon={<PlusOutlined />}
          onClick={() => {
            setEditing(null)
            form.resetFields()
            setOpen(true)
          }}
        >
          添加交付物
        </Button>
      </div>
      <Table
        dataSource={deliverables}
        rowKey="id"
        size="small"
        pagination={false}
        columns={columns}
        locale={{ emptyText: '还没有交付物' }}
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
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="交付物名称"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="如：软件测试报告 v1" />
          </Form.Item>
          <Form.Item name="status" label="状态" initialValue="pending">
            <Select options={STATUS_OPTIONS} />
          </Form.Item>
          <Form.Item name="due_date" label="截止日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
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
        </Form>
      </Modal>
    </div>
  )
}
