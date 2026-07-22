import { useEffect, useState } from 'react'
import { Cloud, Database, Folder, FolderOpen, Save, TestTube2 } from 'lucide-react'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { TextInput } from '../../components/ui/field'

export function LocalStorageSettingsCard() {
  const bridge = window.deek
  const [settings, setSettings] = useState<DeekLocalStorageSettings | null>(null)
  const [driver, setDriver] = useState<'filesystem' | 's3'>('filesystem')
  const [basePath, setBasePath] = useState('')
  const [endpoint, setEndpoint] = useState('http://127.0.0.1:9000')
  const [region, setRegion] = useState('us-east-1')
  const [bucket, setBucket] = useState('deek-pm-assets')
  const [accessKey, setAccessKey] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [forcePathStyle, setForcePathStyle] = useState(true)
  const [message, setMessage] = useState('')
  const [legacyMigration, setLegacyMigration] = useState<DeekLegacyAssetMigrationStatus | null>(null)
  const [busy, setBusy] = useState<'load' | 'test' | 'save' | ''>('load')

  const applySettings = (value: DeekLocalStorageSettings) => {
    setSettings(value)
    setDriver(value.driver)
    if (value.driver === 'filesystem') {
      setBasePath(value.basePath ?? '')
    } else {
      setEndpoint(value.endpoint)
      setRegion(value.region)
      setBucket(value.bucket)
      setForcePathStyle(value.forcePathStyle)
      setAccessKey('')
      setSecretKey('')
    }
  }

  const load = async () => {
    const result = await window.deek?.getLocalStorageSettings?.()
    if (!result?.ok || !result.data) throw new Error(result?.error ?? '无法读取本地文件存储配置')
    applySettings(result.data)
  }

  useEffect(() => {
    if (!bridge?.getLocalStorageSettings) return
    let active = true
    void bridge.getLocalStorageSettings()
      .then((result) => {
        if (!active) return
        if (!result?.ok || !result.data) throw new Error(result?.error ?? '无法读取本地文件存储配置')
        applySettings(result.data)
      })
      .catch((error) => active && setMessage(error instanceof Error ? error.message : '无法读取本地文件存储配置'))
      .finally(() => active && setBusy(''))
    return () => { active = false }
  }, [bridge])

  useEffect(() => {
    if (!bridge?.getLegacyAssetMigrationStatus) return
    let active = true
    const refresh = async () => {
      const status = await bridge.getLegacyAssetMigrationStatus()
      if (active) setLegacyMigration(status)
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 1_000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [bridge])

  if (!bridge?.getLocalStorageSettings) {
    return <Card className="p-5 lg:col-span-2"><h2 className="text-sm font-semibold">本地托管文件物理存储</h2><p className="mt-2 text-sm text-muted-foreground">请在 Electron 桌面客户端中配置。</p></Card>
  }

  const input = (): DeekLocalAssetStorageInput => driver === 'filesystem'
    ? { driver, basePath: basePath.trim() || null }
    : {
        driver,
        endpoint: endpoint.trim(),
        region: region.trim() || 'us-east-1',
        bucket: bucket.trim(),
        forcePathStyle,
        credentials: accessKey.trim() && secretKey ? { accessKey: accessKey.trim(), secretKey } : undefined,
      }

  const chooseDirectory = async () => {
    const selected = await window.deek?.selectPath?.({ kind: 'directory', title: '选择本地托管文件存储位置' })
    if (selected) setBasePath(selected)
  }

  const test = async () => {
    setBusy('test')
    setMessage('')
    try {
      const result = await window.deek?.testLocalAssetStorage?.(input())
      if (!result?.ok) throw new Error(result?.error ?? '存储不可写')
      setMessage(driver === 's3' ? 'S3 连接、Bucket 和写入测试通过。' : '目录写入测试通过。')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '存储测试失败')
    } finally {
      setBusy('')
    }
  }

  const save = async () => {
    setBusy('save')
    setMessage('正在复制并校验现有资产；验证完成前不会切换存储…')
    try {
      const result = await window.deek?.setLocalAssetStorage?.(input())
      if (!result?.ok || !result.data) throw new Error(result?.error ?? '本地存储配置保存失败')
      const moved = result.data.migratedFiles > 0
        ? `已迁移 ${result.data.migratedFiles} 个文件（${formatBytes(result.data.migratedBytes)}）。`
        : '没有需要迁移的已登记资产。'
      await load()
      setMessage(`存储配置已安全切换。${moved}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '本地存储配置保存失败')
    } finally {
      setBusy('')
    }
  }

  return (
    <Card className="p-5 lg:col-span-2">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">本地统一资产存储</h2>
          <p className="mt-1 text-sm text-muted-foreground">正文图片和上传附件使用同一个资产仓储，可保存到本机目录或 S3 兼容服务。</p>
          <p className="mt-1 text-xs text-muted-foreground">切换驱动时先复制并校验，成功后才提交配置；S3 凭据加密保存在 SQLCipher。</p>
        </div>
        <Badge variant={driver === 's3' ? 'default' : 'outline'}>{driver === 's3' ? 'S3' : settings?.configured ? '自定义目录' : '默认目录'}</Badge>
      </div>

      <div className="mt-5 flex gap-2">
        <Button type="button" variant={driver === 'filesystem' ? 'default' : 'outline'} disabled={Boolean(busy)} onClick={() => setDriver('filesystem')}><Folder size={15} />本机目录</Button>
        <Button type="button" variant={driver === 's3' ? 'default' : 'outline'} disabled={Boolean(busy)} onClick={() => setDriver('s3')}><Cloud size={15} />S3 兼容存储</Button>
      </div>

      {driver === 'filesystem' ? (
        <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <TextInput label="物理存储父目录（留空使用默认目录）" value={basePath} onChange={(event) => setBasePath(event.target.value)} placeholder={settings?.defaultPath ?? '应用默认目录'} />
          <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => void chooseDirectory()}><FolderOpen size={15} />选择目录</Button>
        </div>
      ) : (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <TextInput label="S3 Endpoint" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://s3.example.com" />
          <TextInput label="Bucket" value={bucket} onChange={(event) => setBucket(event.target.value)} />
          <TextInput label="Region" value={region} onChange={(event) => setRegion(event.target.value)} />
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={forcePathStyle} onChange={(event) => setForcePathStyle(event.target.checked)} />使用 Path Style（RustFS/MinIO 通常需要）</label>
          <TextInput label={settings?.driver === 's3' && settings.hasCredentials ? 'Access Key（留空保持原值）' : 'Access Key'} value={accessKey} onChange={(event) => setAccessKey(event.target.value)} />
          <TextInput label={settings?.driver === 's3' && settings.hasCredentials ? 'Secret Key（留空保持原值）' : 'Secret Key'} type="password" value={secretKey} onChange={(event) => setSecretKey(event.target.value)} />
        </div>
      )}

      <div className="mt-4 grid gap-2 rounded-md border bg-muted/30 p-3 text-sm">
        <span className="flex items-center gap-2 text-muted-foreground">{settings?.driver === 's3' ? <Cloud size={14} /> : <Folder size={14} />}当前物理位置</span>
        <span className="break-all">{settings?.assetsPath ?? '读取中…'}</span>
      </div>
      {legacyMigration && legacyMigration.state !== 'idle' && (
        <div className="mt-4 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          {legacyMigration.state === 'running'
            ? `正在迁移旧正文图片：已扫描 ${legacyMigration.scannedEntries} 篇，已迁移 ${legacyMigration.migratedAssets} 个资产…`
            : legacyMigration.state === 'failed'
              ? `旧正文图片迁移失败：${legacyMigration.error ?? '未知错误'}`
              : `旧正文图片迁移完成：${legacyMigration.migratedEntries} 篇正文、${legacyMigration.migratedAssets} 个资产、${legacyMigration.failedEntries} 个失败。`}
        </div>
      )}
      {message && <div className="mt-4 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">{message}</div>}
      <div className="mt-5 flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => void test()}><TestTube2 size={15} />{busy === 'test' ? '测试中…' : '测试连接'}</Button>
        <Button type="button" disabled={Boolean(busy)} onClick={() => void save()}><Save size={15} />{busy === 'save' ? '迁移中…' : '保存并迁移'}</Button>
        {settings?.driver === 'filesystem' && <Button type="button" variant="outline" className="ml-auto" disabled={Boolean(busy)} onClick={() => void window.deek?.openLocalAssetsDir?.()}><FolderOpen size={15} />打开当前目录</Button>}
        <span className="inline-flex items-center gap-2 text-xs text-muted-foreground"><Database size={14} />配置加密入本地库</span>
      </div>
    </Card>
  )
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`
}
