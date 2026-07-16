import { useState } from 'react'
import {
  Button,
  Table,
  Tag,
  Form,
  Input,
  Modal,
  Popconfirm,
  App,
  Space,
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { assetsApi } from '../api'
import type { Asset } from '../types'

interface Props {
  projectId: string
}

export default function AssetsTab({ projectId }: Props) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [assetOpen, setAssetOpen] = useState(false)
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null)
  const [assetForm] = Form.useForm()

  const { data: assets } = useQuery({
    queryKey: ['assets', projectId],
    queryFn: () => assetsApi.listByProject(projectId),
    enabled: !!projectId,
  })

  const createAssetMut = useMutation({
    mutationFn: (data: Parameters<typeof assetsApi.create>[1]) =>
      assetsApi.create(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets', projectId] })
      message.success('资产已添加')
      setAssetOpen(false)
      setEditingAsset(null)
      assetForm.resetFields()
    },
  })

  const deleteAssetMut = useMutation({
    mutationFn: assetsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets', projectId] })
      message.success('已删除')
    },
  })

  const updateAssetMut = useMutation({
    mutationFn: (data: {
      aid: string
      body: Parameters<typeof assetsApi.update>[1]
    }) => assetsApi.update(data.aid, data.body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets', projectId] })
      message.success('资产已更新')
      setAssetOpen(false)
      setEditingAsset(null)
      assetForm.resetFields()
    },
  })

  return (
    <div>
      <div className="tab-action">
        <Button
          icon={<PlusOutlined />}
          onClick={() => {
            setEditingAsset(null)
            assetForm.resetFields()
            setAssetOpen(true)
          }}
        >
          添加资产
        </Button>
      </div>
      <Table
        dataSource={assets}
        rowKey="id"
        size="small"
        pagination={false}
        columns={[
          { title: '名称', dataIndex: 'name', key: 'name' },
          {
            title: '类型',
            dataIndex: 'asset_type',
            key: 'asset_type',
            width: 120,
            render: (t: string) => <Tag>{t}</Tag>,
          },
          {
            title: '值',
            dataIndex: 'value',
            key: 'value',
            render: (v: string | null) => v ?? '-',
          },
          {
            title: '描述',
            dataIndex: 'description',
            key: 'description',
            render: (v: string | null) => v ?? '-',
          },
          {
            title: '',
            key: 'action',
            width: 90,
            render: (_: unknown, r: Asset) => (
              <Space size={0}>
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => {
                    setEditingAsset(r)
                    assetForm.setFieldsValue({
                      name: r.name,
                      asset_type: r.asset_type,
                      value: r.value,
                      description: r.description,
                    })
                    setAssetOpen(true)
                  }}
                />
                <Popconfirm
                  title="删除该资产？"
                  onConfirm={() => deleteAssetMut.mutate(r.id)}
                >
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
        ]}
        locale={{ emptyText: '还没有记录资产' }}
      />

      <Modal
        title={editingAsset ? '编辑资产' : '添加资产'}
        open={assetOpen}
        onCancel={() => {
          setAssetOpen(false)
          setEditingAsset(null)
          assetForm.resetFields()
        }}
        onOk={() =>
          assetForm.validateFields().then((v) => {
            if (editingAsset) {
              updateAssetMut.mutate({ aid: editingAsset.id, body: v })
            } else {
              createAssetMut.mutate(v)
            }
          })
        }
        confirmLoading={createAssetMut.isPending || updateAssetMut.isPending}
        width={480}
        okText={editingAsset ? '保存' : '添加'}
        cancelText="取消"
      >
        <Form form={assetForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="名称"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="如：OA 服务器 / 防火墙-1" />
          </Form.Item>
          <Form.Item name="asset_type" label="类型">
            <Input placeholder="如：服务器 / 域名 / 防火墙 / 网关（自由填写）" />
          </Form.Item>
          <Form.Item name="value" label="值">
            <Input placeholder="如：192.168.1.1 / example.com" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}