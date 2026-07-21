import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Database, Folder, Save, Server, TestTube2 } from 'lucide-react'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { TextInput } from '../../components/ui/field'
import { Label } from '../../components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'
import {
  getServiceStorageSettings,
  saveServiceStorageSettings,
  testServiceStorageSettings,
  type ServiceStorageInput,
} from './serviceStorageApi'

interface Props {
  baseUrl: string
  accessToken: string
}

export function ServiceStorageSettingsCard({ baseUrl, accessToken }: Props) {
  const queryClient = useQueryClient()
  const [driver, setDriver] = useState<'filesystem' | 's3'>('filesystem')
  const [filesystemPath, setFilesystemPath] = useState('')
  const [endpoint, setEndpoint] = useState('http://rustfs:9000')
  const [region, setRegion] = useState('us-east-1')
  const [bucket, setBucket] = useState('deek-pm-assets')
  const [forcePathStyle, setForcePathStyle] = useState(true)
  const [accessKey, setAccessKey] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState<'test' | 'save' | ''>('')
  const initializedRef = useRef(false)
  const queryKey = ['service-storage-settings', baseUrl]
  const { data: settings, error, isLoading } = useQuery({
    queryKey,
    queryFn: () => getServiceStorageSettings(baseUrl, accessToken),
    retry: false,
  })

  useEffect(() => {
    if (!settings?.configured || initializedRef.current) return
    initializedRef.current = true
    queueMicrotask(() => {
      setDriver(settings.driver)
      if (settings.driver === 'filesystem') {
        setFilesystemPath(settings.filesystemPath)
        return
      }
      setEndpoint(settings.endpoint)
      setRegion(settings.region)
      setBucket(settings.bucket)
      setForcePathStyle(settings.forcePathStyle)
    })
  }, [settings])

  const buildInput = (): ServiceStorageInput => driver === 'filesystem'
    ? { driver, filesystemPath: filesystemPath.trim() }
    : {
        driver,
        endpoint: endpoint.trim(),
        region: region.trim(),
        bucket: bucket.trim(),
        forcePathStyle,
        ...(accessKey.trim() ? { accessKey: accessKey.trim() } : {}),
        ...(secretKey ? { secretKey } : {}),
      }

  const run = async (kind: 'test' | 'save') => {
    setBusy(kind)
    setMessage('')
    try {
      const input = buildInput()
      if (kind === 'test') {
        await testServiceStorageSettings(baseUrl, accessToken, input)
        setMessage('连接成功，目标存储可写。')
      } else {
        await saveServiceStorageSettings(baseUrl, accessToken, input)
        setAccessKey('')
        setSecretKey('')
        await queryClient.invalidateQueries({ queryKey })
        setMessage('物理存储配置已保存并生效。')
      }
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : '存储配置操作失败')
    } finally {
      setBusy('')
    }
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void run('save')
  }

  if (error) {
    return (
      <Card className="p-5 lg:col-span-2">
        <h2 className="text-sm font-semibold">服务端物理存储</h2>
        <p className="mt-2 text-sm text-muted-foreground">{error instanceof Error ? error.message : '无法读取存储配置'}</p>
      </Card>
    )
  }

  return (
    <Card className="p-5 lg:col-span-2">
      <form onSubmit={submit}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold">服务端物理存储</h2>
            <p className="mt-1 text-sm text-muted-foreground">配置服务端保存正文图片和托管附件的位置。本地离线资料不受此设置影响。</p>
            <p className="mt-1 text-xs text-muted-foreground">完整配置保存在 PostgreSQL；已有托管文件后不能直接切换物理位置，以免旧文件失联。</p>
          </div>
          <Badge variant={settings?.configured ? 'default' : 'outline'}>{isLoading ? '读取中' : settings?.configured ? '已配置' : '未配置'}</Badge>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 md:col-span-2">
            <Label>存储类型</Label>
            <Select value={driver} onValueChange={(value) => setDriver(value as 'filesystem' | 's3')}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="filesystem"><Folder size={15} />服务器目录</SelectItem>
                <SelectItem value="s3"><Server size={15} />RustFS / S3 兼容存储</SelectItem>
              </SelectContent>
            </Select>
          </label>
          {driver === 'filesystem' ? (
            <div className="md:col-span-2">
              <TextInput label="服务器物理目录" value={filesystemPath} onChange={(event) => setFilesystemPath(event.target.value)} placeholder="/data/deek-pm/assets 或 D:\\deek-pm\\assets" />
              <p className="mt-2 text-xs text-muted-foreground">该路径位于运行 API 的服务器上，不是当前客户端电脑的路径。</p>
            </div>
          ) : (
            <>
              <TextInput label="S3 Endpoint" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="http://rustfs:9000" />
              <TextInput label="Bucket" value={bucket} onChange={(event) => setBucket(event.target.value)} />
              <TextInput label="Region" value={region} onChange={(event) => setRegion(event.target.value)} />
              <label className="flex items-end gap-2 pb-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={forcePathStyle} onChange={(event) => setForcePathStyle(event.target.checked)} />
                使用 Path-style（RustFS 建议开启）
              </label>
              <TextInput label="Access Key" value={accessKey} onChange={(event) => setAccessKey(event.target.value)} placeholder={settings?.configured && settings.driver === 's3' ? '已保存；留空表示不修改' : ''} />
              <TextInput label="Secret Key" type="password" value={secretKey} onChange={(event) => setSecretKey(event.target.value)} placeholder={settings?.configured && settings.driver === 's3' ? '已保存；留空表示不修改' : ''} />
            </>
          )}
        </div>
        {message && <div className="mt-4 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">{message}</div>}
        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => void run('test')}>
            <TestTube2 size={15} />
            {busy === 'test' ? '测试中…' : '测试连接'}
          </Button>
          <Button type="submit" disabled={Boolean(busy)}>
            <Save size={15} />
            {busy === 'save' ? '保存中…' : '保存配置'}
          </Button>
          <span className="ml-auto inline-flex items-center gap-2 text-xs text-muted-foreground"><Database size={14} />配置存数据库，密钥加密入库</span>
        </div>
      </form>
    </Card>
  )
}
