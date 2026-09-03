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
import { findingsApi, communicationsApi } from '../api'
import type { ProductSource, FeedbackStatus } from '../types'

const SOURCE_OPTIONS = [
  { label: '我们的产品', value: 'ours' },
  { label: '第三方', value: 'third_party' },
]

const FEEDBACK_OPTIONS = [
  { label: '未反馈', value: 'unreported' },
  { label: '已反馈', value: 'reported' },
]

interface Props {
  projectId: string
}

export default function FindingsTab({ projectId }: Props) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [findingOpen, setFindingOpen] = useState(false)
  const [findingForm] = Form.useForm()

  const { data: findings } = useQuery({
    queryKey: ['findings', projectId],
    queryFn: () => findingsApi.listByProject(projectId),
    enabled: !!projectId,
  })

  const { data: communications } = useQuery({
    queryKey: ['communications', projectId],
    queryFn: () => communicationsApi.listByProject(projectId),
    enabled: !!projectId,
  })

  const createFindingMut = useMutation({
    mutationFn: (v: {
      title: string
      description?: string
      product?: string
      product_source: ProductSource
      vendor?: string
      observed_at?: string
      communication_id?: string
    }) => findingsApi.create(projectId, v),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['findings', projectId] })
      message.success('发现已记录')
      setFindingOpen(false)
      findingForm.resetFields()
    },
  })

  const updateFindingMut = useMutation({
    mutationFn: ({
      findingId,
      data,
    }: {
      findingId: string
      data: Record<string, unknown>
    }) => findingsApi.update(findingId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['findings', projectId] })
    },
  })

  const deleteFindingMut = useMutation({
    mutationFn: findingsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['findings', projectId] })
      message.success('已删除')
    },
  })

  const columns = useMemo(
    () => [
      { title: '问题', dataIndex: 'title', key: 'title' },
      {
        title: '归属',
        dataIndex: 'product_source',
        key: 'product_source',
        width: 110,
        render: (s: ProductSource, r: { id: string }) => (
          <Select
            size="small"
            value={s}
            style={{ width: 100 }}
            options={SOURCE_OPTIONS}
            onChange={(val) =>
              updateFindingMut.mutate({
                findingId: r.id,
                data: { product_source: val },
              })
            }
          />
        ),
      },
      {
        title: '产品',
        dataIndex: 'product',
        key: 'product',
        width: 140,
        render: (v: string | null) => v ?? '-',
      },
      {
        title: '厂商',
        dataIndex: 'vendor',
        key: 'vendor',
        width: 120,
        render: (v: string | null) => v ?? '-',
      },
      {
        title: '反馈',
        dataIndex: 'feedback_status',
        key: 'feedback_status',
        width: 110,
        render: (s: FeedbackStatus, r: { id: string }) => (
          <Select
            size="small"
            value={s}
            style={{ width: 95 }}
            options={FEEDBACK_OPTIONS}
            onChange={(val) =>
              updateFindingMut.mutate({
                findingId: r.id,
                data: { feedback_status: val },
              })
            }
          />
        ),
      },
      {
        title: '发现日期',
        dataIndex: 'observed_at',
        key: 'observed_at',
        width: 110,
        render: (v: string) => dayjs(v).format('MM-DD'),
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
            title="删除该发现？"
            onConfirm={() => deleteFindingMut.mutate(r.id)}
          >
            <Button type="text" danger size="small" icon={<DeleteOutlined />} />
          </Popconfirm>
        ),
      },
    ],
    [],
  )

  return (
    <div>
      <div className="tab-action">
        <Button icon={<PlusOutlined />} onClick={() => setFindingOpen(true)}>
          记录发现
        </Button>
      </div>
      <Table
        dataSource={findings}
        rowKey="id"
        size="small"
        pagination={false}
        scroll={{ x: 'max-content' }}
        columns={columns}
        locale={{ emptyText: '还没有记录的发现' }}
      />

      <Modal
        title="记录产品发现"
        open={findingOpen}
        onCancel={() => setFindingOpen(false)}
        onOk={() =>
          findingForm.validateFields().then((v) => {
            createFindingMut.mutate({
              ...v,
              observed_at: v.observed_at?.toISOString(),
            })
          })
        }
        confirmLoading={createFindingMut.isPending}
        width={480}
        okText="添加"
        cancelText="取消"
      >
        <Form form={findingForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="title"
            label="问题"
            rules={[{ required: true, message: '请输入问题' }]}
          >
            <Input placeholder="如：对象存储偶发超时" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item
            name="product_source"
            label="产品归属"
            initialValue="third_party"
            rules={[{ required: true, message: '请选择产品归属' }]}
          >
            <Select options={SOURCE_OPTIONS} />
          </Form.Item>
          <Form.Item name="product" label="产品名">
            <Input placeholder="如：对象存储 OSS" />
          </Form.Item>
          <Form.Item name="vendor" label="厂商">
            <Input placeholder="第三方产品时填，如：阿里云" />
          </Form.Item>
          <Form.Item name="observed_at" label="发现日期" initialValue={dayjs()}>
            <DatePicker showTime style={{ width: '100%' }} />
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
        </Form>
      </Modal>
    </div>
  )
}
