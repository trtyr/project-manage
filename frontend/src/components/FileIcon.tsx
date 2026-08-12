import {
  FileOutlined,
  FileTextOutlined,
  FilePdfOutlined,
  FileWordOutlined,
  FileExcelOutlined,
  FilePptOutlined,
  FileImageOutlined,
  FileZipOutlined,
  FileMarkdownOutlined,
  LinkOutlined,
} from '@ant-design/icons'

interface Props {
  filename?: string | null
  mimeType?: string | null
  sourceType?: string | null
  size?: number
}

/** Renders a file-type-specific coloured icon so different formats are
 *  distinguishable at a glance (PDF=red, Word=blue, Excel=green, etc.). */
export default function FileIcon({
  filename,
  mimeType,
  sourceType,
  size = 16,
}: Props) {
  if (sourceType === 'link')
    return <LinkOutlined style={{ color: '#13c2c2', fontSize: size }} />

  const ext = filename?.split('.').pop()?.toLowerCase() ?? ''
  const mime = mimeType ?? ''

  const map: Array<{
    exts: string[]
    mimes: string[]
    Icon: typeof FileOutlined
    color: string
  }> = [
    {
      exts: ['pdf'],
      mimes: ['application/pdf'],
      Icon: FilePdfOutlined,
      color: '#ff4d4f',
    },
    {
      exts: ['doc', 'docx'],
      mimes: ['word'],
      Icon: FileWordOutlined,
      color: '#2f54eb',
    },
    {
      exts: ['xls', 'xlsx'],
      mimes: ['excel', 'spreadsheet'],
      Icon: FileExcelOutlined,
      color: '#52c41a',
    },
    {
      exts: ['ppt', 'pptx'],
      mimes: ['powerpoint'],
      Icon: FilePptOutlined,
      color: '#fa8c16',
    },
    {
      exts: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'],
      mimes: ['image/'],
      Icon: FileImageOutlined,
      color: '#722ed1',
    },
    {
      exts: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'],
      mimes: [],
      Icon: FileZipOutlined,
      color: '#d48806',
    },
    {
      exts: ['md', 'markdown'],
      mimes: ['markdown'],
      Icon: FileMarkdownOutlined,
      color: '#2f54eb',
    },
    {
      exts: [
        'txt',
        'json',
        'xml',
        'yaml',
        'yml',
        'js',
        'ts',
        'py',
        'sh',
        'sql',
        'css',
        'ini',
        'conf',
        'toml',
        'log',
        'csv',
        'html',
        'htm',
        'java',
        'c',
        'cpp',
        'go',
        'rs',
        'rb',
        'php',
      ],
      mimes: [
        'text/',
        'application/json',
        'application/xml',
        'application/javascript',
        'application/x-yaml',
      ],
      Icon: FileTextOutlined,
      color: '#595959',
    },
  ]

  for (const { exts, mimes, Icon, color } of map) {
    if (exts.includes(ext) || mimes.some((m) => mime.includes(m)))
      return <Icon style={{ color, fontSize: size }} />
  }

  return <FileOutlined style={{ color: '#8c8c8c', fontSize: size }} />
}
