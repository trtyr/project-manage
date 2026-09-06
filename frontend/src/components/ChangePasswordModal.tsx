import { useState } from 'react'
import { Form, Input, Modal, App } from 'antd'
import { authApi } from '../api'

interface Props {
  open: boolean
  onClose: () => void
}

/**
 * 修改密码弹窗：要求当前密码（被盗号后的最后一道闸），新密码 ≥ 8 位并
 * 二次确认。成功后当前会话保持登录，该账号的其他会话全部被服务端吊销。
 */
export default function ChangePasswordModal({ open, onClose }: Props) {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  function close() {
    form.resetFields()
    onClose()
  }

  async function submit() {
    const v = await form.validateFields()
    setSubmitting(true)
    try {
      await authApi.changePassword({
        current_password: v.current_password,
        new_password: v.new_password,
      })
      message.success('密码已修改，其他设备的登录已全部退出')
      close()
    } catch (err) {
      // 400 carries the backend reason (wrong current password / too
      // short); 429 etc. surface a generic failure line.
      const e = err as { response?: { data?: { message?: string } } }
      const detail = e?.response?.data?.message
      message.error(detail ?? '修改失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="修改密码"
      open={open}
      onCancel={close}
      onOk={submit}
      confirmLoading={submitting}
      okText="修改"
      cancelText="取消"
      destroyOnHidden
      width={420}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item
          name="current_password"
          label="当前密码"
          rules={[{ required: true, message: '请输入当前密码' }]}
        >
          <Input.Password autoFocus autoComplete="current-password" />
        </Form.Item>
        <Form.Item
          name="new_password"
          label="新密码"
          rules={[
            { required: true, message: '请输入新密码' },
            { min: 8, message: '新密码至少 8 位' },
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          name="confirm_password"
          label="确认新密码"
          dependencies={['new_password']}
          rules={[
            { required: true, message: '请再次输入新密码' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || value === getFieldValue('new_password')) {
                  return Promise.resolve()
                }
                return Promise.reject(new Error('两次输入的密码不一致'))
              },
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
