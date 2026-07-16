import { useState } from 'react'
import {
  Typography,
  Button,
  Table,
  Modal,
  Form,
  Input,
  Popconfirm,
  App,
  Space,
} from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { membersApi, contactsApi } from '../api'
import type { Member, ClientContact } from '../types'

const { Title } = Typography

interface Props {
  projectId: string
}

export default function MembersTab({ projectId }: Props) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()

  const [memberOpen, setMemberOpen] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)
  const [editMember, setEditMember] = useState<Member | null>(null)
  const [editContact, setEditContact] = useState<ClientContact | null>(null)
  const [memberForm] = Form.useForm()
  const [contactForm] = Form.useForm()

  const { data: members } = useQuery({
    queryKey: ['members', projectId],
    queryFn: () => membersApi.listByProject(projectId),
  })

  const { data: contacts } = useQuery({
    queryKey: ['contacts', projectId],
    queryFn: () => contactsApi.listByProject(projectId),
  })

  // --- Member mutations ---
  const createMemberMut = useMutation({
    mutationFn: (data: Parameters<typeof membersApi.create>[1]) =>
      membersApi.create(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', projectId] })
      message.success('成员已添加')
      setMemberOpen(false)
      memberForm.resetFields()
    },
  })

  const updateMemberMut = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string
      data: Parameters<typeof membersApi.update>[1]
    }) => membersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', projectId] })
      message.success('已保存')
      setEditMember(null)
      memberForm.resetFields()
    },
  })

  const deleteMemberMut = useMutation({
    mutationFn: membersApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', projectId] })
      message.success('已删除')
    },
  })

  // --- Contact mutations ---
  const createContactMut = useMutation({
    mutationFn: (data: Parameters<typeof contactsApi.create>[1]) =>
      contactsApi.create(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts', projectId] })
      message.success('客户方人员已添加')
      setContactOpen(false)
      contactForm.resetFields()
    },
  })

  const updateContactMut = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string
      data: Parameters<typeof contactsApi.update>[1]
    }) => contactsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts', projectId] })
      message.success('已保存')
      setEditContact(null)
      contactForm.resetFields()
    },
  })

  const deleteContactMut = useMutation({
    mutationFn: contactsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts', projectId] })
      message.success('已删除')
    },
  })

  return (
    <div>
      {/* 团队成员 */}
      <div style={{ marginBottom: 32 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <Title level={5} style={{ margin: 0 }}>
            团队成员
          </Title>
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={() => {
              setMemberOpen(true)
              memberForm.resetFields()
            }}
          >
            添加
          </Button>
        </div>
        <Table
          dataSource={members}
          rowKey="id"
          size="small"
          pagination={false}
          columns={[
            { title: '姓名', dataIndex: 'name', key: 'name' },
            {
              title: '角色',
              dataIndex: 'role',
              key: 'role',
              render: (v: string | null) => v ?? '-',
            },
            {
              title: '备注',
              dataIndex: 'notes',
              key: 'notes',
              render: (v: string | null) => v ?? '-',
            },
            {
              title: '',
              key: 'action',
              width: 80,
              render: (_: unknown, r: Member) => (
                <Space>
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => {
                      setEditMember(r)
                      memberForm.setFieldsValue(r)
                    }}
                  />
                  <Popconfirm
                    title="删除？"
                    onConfirm={() => deleteMemberMut.mutate(r.id)}
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
          locale={{ emptyText: '还没有添加团队成员' }}
        />
      </div>

      {/* 客户方人员 */}
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <Title level={5} style={{ margin: 0 }}>
            客户方人员
          </Title>
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={() => {
              setContactOpen(true)
              contactForm.resetFields()
            }}
          >
            添加
          </Button>
        </div>
        <Table
          dataSource={contacts}
          rowKey="id"
          size="small"
          pagination={false}
          columns={[
            { title: '姓名', dataIndex: 'name', key: 'name' },
            {
              title: '备注',
              dataIndex: 'notes',
              key: 'notes',
              render: (v: string | null) => v ?? '-',
            },
            {
              title: '',
              key: 'action',
              width: 80,
              render: (_: unknown, r: ClientContact) => (
                <Space>
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => {
                      setEditContact(r)
                      contactForm.setFieldsValue(r)
                    }}
                  />
                  <Popconfirm
                    title="删除？"
                    onConfirm={() => deleteContactMut.mutate(r.id)}
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
          locale={{ emptyText: '还没有添加客户方人员' }}
        />
      </div>

      {/* Member Modal */}
      <Modal
        title={editMember ? '编辑成员' : '添加团队成员'}
        open={memberOpen || !!editMember}
        onCancel={() => {
          setMemberOpen(false)
          setEditMember(null)
          memberForm.resetFields()
        }}
        onOk={() =>
          memberForm.validateFields().then((v) => {
            if (editMember) {
              updateMemberMut.mutate({ id: editMember.id, data: v })
            } else {
              createMemberMut.mutate(v)
            }
          })
        }
        confirmLoading={createMemberMut.isPending || updateMemberMut.isPending}
        width={440}
        okText={editMember ? '保存' : '添加'}
        cancelText="取消"
      >
        <Form form={memberForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="姓名"
            rules={[{ required: true, message: '请输入姓名' }]}
          >
            <Input placeholder="姓名" />
          </Form.Item>
          <Form.Item name="role" label="角色">
            <Input placeholder="如：测试工程师 / 项目经理" />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Contact Modal */}
      <Modal
        title={editContact ? '编辑客户方人员' : '添加客户方人员'}
        open={contactOpen || !!editContact}
        onCancel={() => {
          setContactOpen(false)
          setEditContact(null)
          contactForm.resetFields()
        }}
        onOk={() =>
          contactForm.validateFields().then((v) => {
            if (editContact) {
              updateContactMut.mutate({ id: editContact.id, data: v })
            } else {
              createContactMut.mutate(v)
            }
          })
        }
        confirmLoading={createContactMut.isPending || updateContactMut.isPending}
        width={440}
        okText={editContact ? '保存' : '添加'}
        cancelText="取消"
      >
        <Form form={contactForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="姓名"
            rules={[{ required: true, message: '请输入姓名' }]}
          >
            <Input placeholder="姓名" />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
