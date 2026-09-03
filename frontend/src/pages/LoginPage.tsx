import { useState } from 'react'
import { Button, Form, Input, Typography, App } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { authApi } from '../api'
import type { UserPublic } from '../types'

const { Title, Text } = Typography

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
      const e = err as { response?: { status?: number } }
      if (e?.response?.status === 401) {
        message.error('用户名或密码错误')
      } else {
        message.error('登录失败，请稍后重试')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg, #f5f7f7)',
      }}
    >
      <div
        style={{
          width: 360,
          padding: 32,
          background: 'var(--card-surface, #fff)',
          borderRadius: 8,
          border: '1px solid var(--hairline, #e8eded)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: 'var(--primary, #148374)',
              display: 'inline-block',
              marginRight: 8,
            }}
          />
          <Title level={4} style={{ margin: 0, display: 'inline' }}>
            项目管理
          </Title>
        </div>
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input placeholder="用户名或邮箱" autoFocus />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password placeholder="密码" />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            block
            loading={loading}
            style={{ marginTop: 8 }}
          >
            登录
          </Button>
        </Form>
        <Text
          type="secondary"
          style={{
            display: 'block',
            textAlign: 'center',
            marginTop: 16,
            fontSize: 12,
          }}
        >
          内部工具 · 仅限授权用户
        </Text>
      </div>
    </div>
  )
}
