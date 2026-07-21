import { useEffect, useState } from 'react'
import { Database, Folder, FolderOpen, RotateCcw, Save, TestTube2 } from 'lucide-react'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { TextInput } from '../../components/ui/field'

export function LocalStorageSettingsCard() {
  const bridge = window.deek
  const [settings, setSettings] = useState<DeekLocalStorageSettings | null>(null)
  const [basePath, setBasePath] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState<'load' | 'test' | 'save' | 'reset' | ''>('load')

  const load = async () => {
    const result = await window.deek?.getLocalStorageSettings?.()
    if (!result?.ok || !result.data) throw new Error(result?.error ?? '无法读取本地文件存储配置')
    setSettings(result.data)
    setBasePath(result.data.basePath ?? '')
  }

  useEffect(() => {
    if (!bridge?.getLocalStorageSettings) return
    let active = true
    void bridge.getLocalStorageSettings()
      .then((result) => {
        if (!active) return
        if (!result?.ok || !result.data) throw new Error(result?.error ?? '无法读取本地文件存储配置')
        setSettings(result.data)
        setBasePath(result.data.basePath ?? '')
      })
      .catch((error) => active && setMessage(error instanceof Error ? error.message : '无法读取本地文件存储配置'))
      .finally(() => active && setBusy(''))
    return () => { active = false }
  }, [bridge])

  if (!bridge?.getLocalStorageSettings) {
    return (
      <Card className="p-5 lg:col-span-2">
        <h2 className="text-sm font-semibold">本地托管文件物理存储</h2>
        <p className="mt-2 text-sm text-muted-foreground">Web 预览无法配置本机目录，请在 Electron 桌面客户端中使用。</p>
      </Card>
    )
  }

  const chooseDirectory = async () => {
    const selected = await window.deek?.selectPath?.({ kind: 'directory', title: '选择本地托管文件存储位置' })
    if (selected) setBasePath(selected)
  }

  const test = async () => {
    if (!basePath.trim()) return
    setBusy('test')
    setMessage('')
    try {
      const result = await window.deek?.testLocalStoragePath?.(basePath.trim())
      if (!result?.ok) throw new Error(result?.error ?? '目录不可写')
      setMessage(`目录可写，实际文件将保存在：${result.data?.assetsPath}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '目录测试失败')
    } finally {
      setBusy('')
    }
  }

  const save = async (nextBasePath: string | null) => {
    setBusy(nextBasePath === null ? 'reset' : 'save')
    setMessage(nextBasePath === null ? '正在迁回默认目录并校验文件…' : '正在迁移并校验现有文件…')
    try {
      const result = await window.deek?.setLocalStoragePath?.(nextBasePath)
      if (!result?.ok || !result.data) throw new Error(result?.error ?? '本地存储位置保存失败')
      await load()
      const moved = result.data.migratedFiles > 0
        ? `已迁移 ${result.data.migratedFiles} 个文件（${formatBytes(result.data.migratedBytes)}）。`
        : '当前没有需要迁移的文件。'
      setMessage(`${nextBasePath === null ? '已恢复默认存储位置。' : '本地物理存储配置已保存到 SQLCipher 数据库。'}${moved}${result.data.cleanupWarning ? ` 旧目录未完全清理：${result.data.cleanupWarning}` : ''}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '本地存储位置保存失败')
    } finally {
      setBusy('')
    }
  }

  return (
    <Card className="p-5 lg:col-span-2">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">本地托管文件物理存储</h2>
          <p className="mt-1 text-sm text-muted-foreground">正文图片和上传附件默认保存在应用数据目录，也可以迁移到其他磁盘。</p>
          <p className="mt-1 text-xs text-muted-foreground">选择的是父目录，Deek PM 会使用其中独立的 `deek-pm-assets` 子目录；配置保存在本地 SQLCipher 数据库。</p>
          <p className="mt-1 text-xs text-muted-foreground">超过 16 MB 的单个文件不会内嵌进 `.deekbak`，请把该物理目录纳入磁盘备份。</p>
        </div>
        <Badge variant={settings?.configured ? 'default' : 'outline'}>{busy === 'load' ? '读取中' : settings?.configured ? '自定义目录' : '默认目录'}</Badge>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <TextInput label="物理存储父目录" value={basePath} onChange={(event) => setBasePath(event.target.value)} placeholder={settings?.defaultPath ?? '选择其他磁盘或目录'} />
        <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => void chooseDirectory()}><FolderOpen size={15} />选择目录</Button>
      </div>
      <div className="mt-4 grid gap-2 rounded-md border bg-muted/30 p-3 text-sm">
        <span className="flex items-center gap-2 text-muted-foreground"><Folder size={14} />当前实际目录</span>
        <span className="break-all">{settings?.assetsPath ?? '读取中…'}</span>
      </div>
      {message && <div className="mt-4 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">{message}</div>}
      <div className="mt-5 flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={Boolean(busy) || !basePath.trim()} onClick={() => void test()}><TestTube2 size={15} />{busy === 'test' ? '测试中…' : '测试目录'}</Button>
        <Button type="button" disabled={Boolean(busy) || !basePath.trim()} onClick={() => void save(basePath.trim())}><Save size={15} />{busy === 'save' ? '迁移中…' : '保存并迁移'}</Button>
        <Button type="button" variant="ghost" disabled={Boolean(busy) || !settings?.configured} onClick={() => void save(null)}><RotateCcw size={15} />{busy === 'reset' ? '迁回中…' : '恢复默认目录'}</Button>
        <Button type="button" variant="outline" className="ml-auto" disabled={Boolean(busy)} onClick={() => void window.deek?.openLocalAssetsDir?.()}><FolderOpen size={15} />打开当前目录</Button>
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
