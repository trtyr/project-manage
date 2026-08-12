import { useState, useEffect, useRef } from 'react'
import { Modal, Typography, Skeleton } from 'antd'
import { filesApi } from '../api'
import type { ProjectFile } from '../types'

const { Text } = Typography

function isTextType(mime: string, filename: string): boolean {
  if (mime.startsWith('text/') && mime !== 'text/html') return true
  const textMimes = [
    'application/json',
    'application/xml',
    'application/javascript',
    'application/x-yaml',
    'application/x-sh',
    'application/toml',
    'text/x-toml',
  ]
  if (textMimes.includes(mime)) return true
  const ext = filename.split('.').pop()?.toLowerCase()
  const textExts = [
    'txt',
    'md',
    'json',
    'csv',
    'log',
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
  ]
  return ext ? textExts.includes(ext) : false
}

function isHtmlType(mime: string, filename: string): boolean {
  if (mime === 'text/html') return true
  const ext = filename.split('.').pop()?.toLowerCase()
  return ext === 'html' || ext === 'htm'
}

function isImageType(mime: string): boolean {
  return mime.startsWith('image/')
}

function isPdfType(mime: string): boolean {
  return mime === 'application/pdf'
}

interface Props {
  file: ProjectFile | null
  open: boolean
  onClose: () => void
}

export default function FilePreview({ file, open, onClose }: Props) {
  const [textContent, setTextContent] = useState('')
  const [loading, setLoading] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (!open) return
    const iframe = iframeRef.current
    if (!iframe) return
    const handleLoad = () => {
      try {
        const doc = iframe.contentDocument
        if (doc) {
          doc.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') onClose()
          })
        }
      } catch {
        /* cross-origin */
      }
    }
    iframe.addEventListener('load', handleLoad)
    return () => iframe.removeEventListener('load', handleLoad)
  }, [open, onClose])

  useEffect(() => {
    if (!file || !open) return
    setTextContent('')
    if (isTextType(file.mime_type, file.original_name)) {
      const controller = new AbortController()
      setLoading(true)
      fetch(filesApi.previewUrl(file.id), { signal: controller.signal })
        .then((r) => r.text())
        .then((text) => {
          setTextContent(text)
          setLoading(false)
        })
        .catch((err) => {
          // Swallow the abort signal: it's a normal teardown, not a failure.
          if (err?.name === 'AbortError') return
          setTextContent('加载失败')
          setLoading(false)
        })
      return () => controller.abort()
    }
  }, [file, open])

  if (!file) return null

  const previewUrl = filesApi.previewUrl(file.id)

  return (
    <Modal
      title={file.original_name}
      open={open}
      onCancel={onClose}
      footer={null}
      centered
      width="100%"
      styles={{ body: { height: '85vh', overflow: 'auto', padding: 0 } }}
    >
      {isImageType(file.mime_type) && (
        <div style={{ textAlign: 'center', padding: 16 }}>
          <img
            src={previewUrl}
            alt={file.original_name}
            style={{ maxWidth: '100%', maxHeight: '60vh', borderRadius: 8 }}
          />
        </div>
      )}
      {isPdfType(file.mime_type) && (
        <iframe
          src={previewUrl}
          style={{ width: '100%', height: '85vh', border: 'none' }}
          title={file.original_name}
        />
      )}
      {isHtmlType(file.mime_type, file.original_name) && (
        <iframe
          ref={iframeRef}
          src={previewUrl}
          style={{
            width: '100%',
            height: '85vh',
            border: 'none',
            borderRadius: 8,
          }}
          title={file.original_name}
          sandbox="allow-same-origin allow-scripts"
        />
      )}
      {isTextType(file.mime_type, file.original_name) && (
        <div style={{ padding: 16 }}>
          {loading ? (
            <div style={{ padding: 24 }}>
              <Skeleton active paragraph={{ rows: 8 }} />
            </div>
          ) : (
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: 13,
                fontFamily: 'var(--font-mono)',
                margin: 0,
                lineHeight: 1.6,
                color: 'var(--ink)',
              }}
            >
              {textContent.split('\n').map((line, i) => (
                <div key={i} style={{ display: 'flex' }}>
                  <span
                    style={{
                      color: 'var(--muted)',
                      width: 44,
                      textAlign: 'right',
                      paddingRight: 12,
                      userSelect: 'none',
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </span>
                  <span style={{ flex: 1 }}>{line || ' '}</span>
                </div>
              ))}
            </pre>
          )}
        </div>
      )}
      {!isImageType(file.mime_type) &&
        !isPdfType(file.mime_type) &&
        !isHtmlType(file.mime_type, file.original_name) &&
        !isTextType(file.mime_type, file.original_name) && (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Text type="secondary">此文件类型不支持在线预览，请下载查看</Text>
          </div>
        )}
    </Modal>
  )
}
