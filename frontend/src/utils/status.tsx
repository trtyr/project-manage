import type { ReactNode } from 'react'
import type { PillTone } from '../components/ui/Pill'

/**
 * Central status/priority metadata: display label + pill tone for every
 * enum-ish domain value. One source so tables, pills and cell selects
 * never drift apart.
 */

export interface StatusMeta {
  label: string
  tone: PillTone
}

export const PROJECT_STATUS_META: Record<string, StatusMeta> = {
  in_progress: { label: '进行中', tone: 'blue' },
  completed: { label: '已完成', tone: 'green' },
  paused: { label: '已暂停', tone: 'amber' },
}

export const TASK_STATUS_META: Record<string, StatusMeta> = {
  current: { label: '当前', tone: 'blue' },
  next: { label: '下一步', tone: 'purple' },
  todo: { label: '待办', tone: 'neutral' },
}

export const PRIORITY_META: Record<string, StatusMeta> = {
  urgent: { label: '紧急', tone: 'red' },
  high: { label: '高', tone: 'amber' },
  normal: { label: '正常', tone: 'neutral' },
  low: { label: '低', tone: 'neutral' },
}

export const ISSUE_STATUS_META: Record<string, StatusMeta> = {
  open: { label: '待解决', tone: 'amber' },
  in_progress: { label: '进行中', tone: 'blue' },
  resolved: { label: '已解决', tone: 'green' },
}

export const PHASE_STATUS_META: Record<string, StatusMeta> = {
  pending: { label: '待开始', tone: 'neutral' },
  in_progress: { label: '进行中', tone: 'blue' },
  completed: { label: '已完成', tone: 'green' },
}

export const DELIVERABLE_STATUS_META: Record<string, StatusMeta> = {
  pending: { label: '待交付', tone: 'amber' },
  delivered: { label: '已交付', tone: 'blue' },
  accepted: { label: '已验收', tone: 'green' },
}

export const CRED_TYPE_META: Record<string, StatusMeta> = {
  password: { label: '密码', tone: 'blue' },
  api_key: { label: 'API Key', tone: 'purple' },
  certificate: { label: '证书/密钥', tone: 'amber' },
  token: { label: '令牌', tone: 'teal' },
  other: { label: '其他', tone: 'neutral' },
}

export const TECH_APPROVAL_META: Record<string, StatusMeta> = {
  未接触: { label: '未接触', tone: 'neutral' },
  POC中: { label: 'POC中', tone: 'blue' },
  已认可: { label: '已认可', tone: 'green' },
  技术否决: { label: '技术否决', tone: 'red' },
}

export const FEEDBACK_META: Record<string, StatusMeta> = {
  unreported: { label: '未反馈', tone: 'neutral' },
  reported: { label: '已反馈', tone: 'green' },
}

export const SOURCE_META: Record<string, StatusMeta> = {
  ours: { label: '我们的产品', tone: 'blue' },
  third_party: { label: '第三方', tone: 'neutral' },
}

/** Asset types → pill tone (free-form values fall back to neutral). */
export const ASSET_TYPE_TONE: Record<string, PillTone> = {
  防火墙: 'red',
  WAF: 'red',
  堡垒机: 'red',
  IDS: 'purple',
  IPS: 'purple',
  'IDS/IPS': 'purple',
  NDR: 'amber',
  EDR: 'purple',
  DLP: 'amber',
  SOC: 'blue',
  SIEM: 'purple',
  SOAR: 'purple',
  威胁情报: 'teal',
  暴露面检测: 'amber',
  蜜罐: 'purple',
  零信任: 'teal',
  VPN: 'blue',
  网关: 'amber',
  监控系统: 'blue',
  日志系统: 'purple',
  数据库: 'amber',
  服务器: 'neutral',
  应用: 'green',
  数据管理系统: 'purple',
  域名: 'teal',
  云平台: 'blue',
}

/** Pill tone → CSS color variable (for dots outside .pill contexts). */
export function toneColor(tone: PillTone): string {
  return tone === 'neutral' ? 'var(--ink-3)' : `var(--${tone})`
}

/** Turn a meta map into Select options that render a colored dot. */
export function dotLabel(meta: StatusMeta): ReactNode {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 9999,
          background: toneColor(meta.tone),
          flexShrink: 0,
        }}
      />
      {meta.label}
    </span>
  )
}

/** A full meta map → AntD Select options (dot + label). */
export function metaOptions(meta: Record<string, StatusMeta>) {
  return Object.entries(meta).map(([value, m]) => ({
    value,
    label: dotLabel(m),
  }))
}
