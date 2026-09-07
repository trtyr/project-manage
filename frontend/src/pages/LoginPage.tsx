import { useState } from 'react'
import { Button, Form, Input, App } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { authApi, classifyApiError } from '../api'
import type { UserPublic } from '../types'

export default function LoginPage() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState(false)

  const onFinish = async (v: { username: string; password: string }) => {
    setLoading(true)
    try {
      const user = await authApi.login(v)
      // The App-level ['auth-me'] query is either error (pre-login race) or
      // disabled — nobody refetches it on SPA navigation. Seed the cache
      // with the login response so the sidebar (logout button, counters)
      // renders without a manual page refresh.
      queryClient.setQueryData<UserPublic>(['auth-me'], user)
      message.success('登录成功')
      navigate('/')
    } catch (err) {
      const info = classifyApiError(err)
      if (info.kind === 'rate_limited') {
        message.error('尝试次数过多，登录已被临时锁定，请约 15 分钟后再试')
      } else if (info.kind === 'validation' || info.status === 401) {
        message.error('用户名或密码错误')
      } else if (info.kind === 'offline') {
        message.error('网络异常，请检查连接后重试')
      } else {
        message.error('登录失败，请稍后重试')
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
          <h1 className="auth-title">登录到项目管理</h1>
        </div>
        <p className="auth-sub">输入你的账号和密码继续</p>
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
            <Input placeholder="用户名或邮箱" autoFocus size="large" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password placeholder="密码" size="large" />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            block
            loading={loading}
            size="large"
          >
            登录
          </Button>
        </Form>
        <div className="auth-footer">内部工具 · 仅限授权用户</div>
      </div>
    </div>
  )
}
