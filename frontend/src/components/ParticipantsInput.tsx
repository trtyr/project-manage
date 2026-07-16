import { Select } from 'antd'

interface Props {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
}

/** Parse a delimited string into individual name tags. */
function parseParticipants(value?: string | null): string[] {
  if (!value) return []
  return value
    .split(/[,，、;；]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Tag-style participant input. Type a name, press Enter (or a delimiter
 * like comma / 、 / ;), and it becomes a tag. Works with Ant Design Form.
 */
export default function ParticipantsInput({
  value,
  onChange,
  placeholder,
}: Props) {
  return (
    <Select
      mode="tags"
      value={parseParticipants(value)}
      onChange={(tags: string[]) => onChange?.(tags.join(', '))}
      placeholder={placeholder ?? '输入姓名后回车，支持逗号 / 顿号 / 分号分隔'}
      style={{ width: '100%' }}
      tokenSeparators={[',', '，', '、', ';', '；']}
      open={false}
    />
  )
}
