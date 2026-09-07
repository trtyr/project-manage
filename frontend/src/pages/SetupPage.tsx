import { useState } from 'react'
import { Button, Form, Input, App } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { authApi } from '../api'
import type { UserPublic } from '../types'

/// First-run bootstrap: create the initial account. The backend only
/// accepts this while the users table is empty (409 afterwards).
export default function SetupPage() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState(false)

  const onFinish = async (v: {
    username: string
    password: string
    display_name?: string
  }) => {
    setLoading(true)
    try {
      const user = await authApi.setup(v)
      // Setup logs the user in server-side, but the cached auth-status
      // still says needs_setup:true (60s staleTime) — the App bootstrap
      // effect would bounce us right back to /setup. Flip both caches
      // with the response we already hold.
      queryClient.setQueryData(['auth-status'], { needs_setup: false })
      queryClient.setQueryData<UserPublic>(['auth-me'], user)
      message.success('初始化完成，欢迎使用！')
      navigate('/')
    } catch (err) {
      const e = err as { response?: { status?: number } }
      if (e?.response?.status === 409) {
        message.error('系统已初始化过，请直接登录')
        navigate('/login')
      } else {
        message.error('初始化失败，请稍后重试')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span
            className="brand-mark"
            style={{ width: 32, height: 32, borderRadius: 8 }}
          />
          <h1 className="auth-title">系统初始化</h1>
        </div>
        <p className="auth-sub">
          首次使用，请创建管理员账号。
          <br />
          此页面仅出现一次。
        </p>
        <Form
          className="auth-form"
          layout="vertical"
          onFinish={onFinish}
          requiredMark={false}
        >
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input placeholder="用户名或邮箱" autoFocus />
          </Form.Item>
          <Form.Item name="display_name" label="显示名（可选）">
            <Input placeholder="怎么称呼你" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 8, message: '密码至少 8 位' },
            ]}
          >
            <Input.Password placeholder="至少 8 位" />
          </Form.Item>
          <Form.Item
            name="confirm"
            label="确认密码"
            dependencies={['password']}
            rules={[
              { required: true, message: '请再次输入密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'))
                },
              }),
            ]}
          >
            <Input.Password placeholder="再输一遍" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            创建账号并进入
          </Button>
        </Form>
        <div className="auth-footer">创建后此接口将永久关闭</div>
      </div>
    </div>
  )
}
