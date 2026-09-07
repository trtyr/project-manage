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
  password: { label: '账号密码', tone: 'blue' },
  aksk: { label: 'AK/SK', tone: 'green' },
  api_key: { label: 'API Key', tone: 'purple' },
  certificate: { label: '证书/密钥', tone: 'amber' },
  token: { label: '令牌', tone: 'teal' },
  other: { label: '其他', tone: 'neutral' },
}

/**
 * Per-type form wording for the credential drawer: what to call the
 * username/secret halves and how to hint them. Falls back to generic
 * 凭据 wording for unknown/legacy types.
 */
export interface CredTypeFields {
  usernameLabel: string
  usernamePlaceholder: string
  secretLabel: string
  secretPlaceholder: string
  /** Shown under the type selector. */
  hint: string
}

const CRED_TYPE_FIELDS: Record<string, CredTypeFields> = {
  password: {
    usernameLabel: '账号',
    usernamePlaceholder: 'root / admin@example.com',
    secretLabel: '密码',
    secretPlaceholder: '登录密码',
    hint: '控制台、SSH、数据库等登录账号与密码',
  },
  aksk: {
    usernameLabel: 'Access Key ID',
    usernamePlaceholder: 'AKID… / LTAI…',
    secretLabel: 'Access Key Secret',
    secretPlaceholder: '与 Access Key ID 配对的私钥',
    hint: '云平台/对象存储的访问密钥对，AK 填账号栏、SK 填密钥栏',
  },
  api_key: {
    usernameLabel: '绑定账号（可选）',
    usernamePlaceholder: '该 Key 所属的服务账号',
    secretLabel: 'API Key',
    secretPlaceholder: 'sk-… / 单独下发的调用密钥',
    hint: '单独下发的接口调用密钥，只需填密钥一栏',
  },
  certificate: {
    usernameLabel: '标识（可选）',
    usernamePlaceholder: 'CN=… / 证书昵称',
    secretLabel: '证书/私钥内容',
    secretPlaceholder: 'PEM 文本或私钥内容',
    hint: 'TLS 证书、签名私钥等；内容较长时建议只存指纹与位置',
  },
  token: {
    usernameLabel: '标识（可选）',
    usernamePlaceholder: '用途 / 颁发对象',
    secretLabel: 'Token',
    secretPlaceholder: 'ghp_… / JWT / Bearer 令牌',
    hint: '登录令牌、刷新令牌、Bearer Token',
  },
  other: {
    usernameLabel: '账号/标识（可选）',
    usernamePlaceholder: '按凭据形态填写',
    secretLabel: '凭据内容',
    secretPlaceholder: '密钥、口令或内容',
    hint: '不属于以上分类的凭据',
  },
}

export function credTypeFields(
  credType: string | null | undefined,
): CredTypeFields {
  return CRED_TYPE_FIELDS[credType ?? ''] ?? CRED_TYPE_FIELDS.other
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
  网闸: 'amber',
  蜜罐: 'purple',
  暴露面检测: 'amber',
  EDR: 'purple',
  DLP: 'amber',
  沙箱: 'purple',
  终端管控: 'amber',
  零信任: 'teal',
  VPN: 'blue',
  网关: 'amber',
  SOC: 'blue',
  SIEM: 'purple',
  SOAR: 'purple',
  威胁情报: 'teal',
  态势感知: 'blue',
  监控系统: 'blue',
  日志系统: 'purple',
  服务器: 'neutral',
  数据库: 'amber',
  云平台: 'blue',
  虚拟化: 'teal',
  容器: 'teal',
  备份系统: 'neutral',
  域名: 'teal',
  应用: 'green',
  数据管理系统: 'purple',
  中间件: 'amber',
  'OA/邮箱': 'green',
  业务系统: 'green',
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
