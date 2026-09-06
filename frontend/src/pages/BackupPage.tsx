import { useState } from 'react'
import { Button, Card, Typography, Upload, App, Space, Tag } from 'antd'
import {
  DownloadOutlined,
  UploadOutlined,
  FileZipOutlined,
  FileTextOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { backupApi, type ImportReport } from '../api'

const { Title, Text, Paragraph } = Typography

function describeReport(r: ImportReport): string {
  const parts = [
    `客户 ${r.clients}`,
    `项目 ${r.projects}`,
    `阶段 ${r.phases}`,
    `人员 ${r.people}`,
    `沟通 ${r.communications}`,
    `任务 ${r.tasks}`,
    `关切 ${r.issues}`,
    `发现 ${r.findings}`,
    `资产 ${r.assets}`,
    `凭据 ${r.asset_credentials}`,
    `文件 ${r.project_files}`,
    `交付物 ${r.deliverables}`,
  ]
  return parts.join(' · ')
}

/**
 * 备份与恢复：整库导出 / 导入。
 * - JSON 快照只含数据（保留原 ID）；ZIP 归档额外包含上传的文件内容。
 * - 导入是"整体替换"：现有业务数据全部清空后按备份重建（事务，失败回滚）。
 * - 备份文件里资产凭据是明文，按敏感文件保管。
 */
export default function BackupPage() {
  const { message, modal } = App.useApp()
  const [importing, setImporting] = useState(false)
  const [lastReport, setLastReport] = useState<ImportReport | null>(null)

  async function doImport(file: File) {
    setImporting(true)
    try {
      const isZip = file.name.toLowerCase().endsWith('.zip')
      const report = isZip
        ? await backupApi.importArchive(file)
        : await backupApi.importJson(JSON.parse(await file.text()))
      setLastReport(report)
      message.success('导入完成，数据已替换为备份内容')
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } }
      const detail = e?.response?.data?.message
      message.error(detail ?? '导入失败：文件无法识别或服务端拒绝')
    } finally {
      setImporting(false)
    }
  }

  function confirmImport(file: File) {
    const isZip = file.name.toLowerCase().endsWith('.zip')
    modal.confirm({
      title: '确认导入并替换全部数据？',
      icon: <WarningOutlined style={{ color: 'var(--warning, #d48806)' }} />,
      content: (
        <Space direction="vertical" size={4}>
          <Text>
            文件：<Text code>{file.name}</Text>
          </Text>
          <Text type="danger">
            当前所有客户、项目、任务等业务数据将被清空，以备份内容完全替换（登录账号不受影响）。
          </Text>
          {!isZip && (
            <Text type="secondary">
              JSON 快照不包含上传文件的内容；需要连文件一起恢复请使用 ZIP 归档。
            </Text>
          )}
        </Space>
      ),
      okText: '替换全部数据',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => doImport(file),
    })
  }

  return (
    <div>
      <Title level={4} style={{ marginTop: 0 }}>
        备份与恢复
      </Title>

      <Card
        title={
          <Space>
            <DownloadOutlined />
            导出
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <Paragraph type="secondary" style={{ marginBottom: 12 }}>
          导出全部业务数据（客户、项目、阶段、人员、沟通、任务、关切、发现、资产、凭据、文件记录、交付物），
          保留原有 ID 与关联关系。资产凭据以明文写入备份文件，请妥善保管。
        </Paragraph>
        <Space wrap>
          <Button
            href={backupApi.exportJsonUrl}
            download
            icon={<FileTextOutlined />}
          >
            导出 JSON 数据快照
          </Button>
          <Button
            href={backupApi.exportArchiveUrl}
            download
            icon={<FileZipOutlined />}
            type="primary"
          >
            下载完整备份（ZIP，含上传文件）
          </Button>
        </Space>
      </Card>

      <Card
        title={
          <Space>
            <UploadOutlined />
            导入恢复
          </Space>
        }
      >
        <Paragraph type="secondary" style={{ marginBottom: 12 }}>
          支持 JSON 快照（<Text code>.json</Text>）或完整归档（
          <Text code>.zip</Text>）。 导入会<b>整体替换</b>当前业务数据；ZIP
          归档还会将上传文件目录重置为归档内容。
        </Paragraph>
        <Upload.Dragger
          name="file"
          accept=".json,.zip"
          maxCount={1}
          showUploadList={false}
          disabled={importing}
          customRequest={({ file }) => confirmImport(file as File)}
        >
          <p style={{ fontSize: 32, margin: '12px 0 4px' }}>
            <UploadOutlined />
          </p>
          <Paragraph style={{ margin: 0 }}>点击或拖入备份文件</Paragraph>
          <Text type="secondary">.json 数据快照 / .zip 完整归档</Text>
        </Upload.Dragger>
        {importing && (
          <Paragraph style={{ marginTop: 12 }}>
            <Tag color="processing">导入中…</Tag>
          </Paragraph>
        )}
        {lastReport && (
          <div style={{ marginTop: 16 }}>
            <Paragraph strong style={{ marginBottom: 4 }}>
              上次导入结果
            </Paragraph>
            <Paragraph code style={{ marginBottom: 4 }}>
              {describeReport(lastReport)}
            </Paragraph>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              恢复的文件 {lastReport.files_written} 个
              {lastReport.files_missing.length > 0 && (
                <Text type="warning">
                  ；缺失 {lastReport.files_missing.length}{' '}
                  个（备份归档中没有对应内容）
                </Text>
              )}
            </Paragraph>
          </div>
        )}
      </Card>

      <Paragraph
        type="secondary"
        style={{ marginTop: 16, marginBottom: 0, fontSize: 12 }}
      >
        提示：定期下载 ZIP 完整备份；仅用 JSON
        快照迁移时，上传文件的正文不会跟随迁移。
      </Paragraph>
    </div>
  )
}
