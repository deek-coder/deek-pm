import type { FormEvent, ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { Link, Outlet, useNavigate, useParams, useRouterState } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LazyMotion, domAnimation, m } from 'motion/react'
import {
  ArrowLeft,
  ArrowUpDown,
  BarChart3,
  CalendarClock,
  ChevronRight,
  Cloud,
  Copy,
  Database,
  Download,
  ExternalLink,
  File,
  FolderOpen,
  Folder,
  Grid2X2,
  HardDrive,
  Info,
  List,
  Link2,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  Server,
  Settings,
  ShieldCheck,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react'
import { AppShell } from '../../components/layout/AppShell'
import { PageHeader } from '../../components/layout/PageHeader'
import { WindowControls, WindowDragStrip } from '../../components/layout/WindowControls'
import { Badge } from '../../components/ui/badge'
import { Button, buttonVariants } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
import { TextInput } from '../../components/ui/field'
import { Label } from '../../components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'
import { Textarea } from '../../components/ui/textarea'
import deekLogoMark from '../../assets/deek-logo-mark.png'
import type { BackupPayload } from '../../repositories/repository'
import type { Project, ProjectTone, QuickEntry, QuickEntryTargetType, Workspace } from '../../domain/types'
import { useRepositories, useRepositorySource } from '../../repositories/repositoryContext'
import { cn } from '../../shared/cn'
import { useWorkspaceTabs } from '../../stores/workspaceTabs'
import { deploymentLabel, iconTone, workspaceLabel } from './workspaceLabels'
import { officialServiceUrl, useRuntimeConfig, type SavedServiceConnection } from '../../runtimeConfigContext'
import { ServiceStorageSettingsCard } from '../settings/ServiceStorageSettingsCard'
import { LocalStorageSettingsCard } from '../settings/LocalStorageSettingsCard'
import { changeServicePassword } from '../settings/serviceAccountApi'
import { createServerRepositories, getServiceInstance, loginToService, normalizeServiceUrl } from '../../repositories/serverRepository'
import { migrateLocalBackupToService } from './migrateLocalBackup'

type ProjectViewMode = 'grid' | 'list'
type ProjectSortMode = 'updated' | 'name' | 'entries'

interface ProjectFormValues {
  name: string
  description: string
  tag: string
  tone: ProjectTone
}

const projectToneStyle: Record<ProjectTone, { dot: string; panel: string; icon: string; line: string }> = {
  blue: { dot: 'bg-sky-500', panel: 'bg-sky-50 text-sky-700 ring-sky-100', icon: 'text-sky-600', line: 'border-l-sky-500' },
  green: { dot: 'bg-emerald-500', panel: 'bg-emerald-50 text-emerald-700 ring-emerald-100', icon: 'text-emerald-600', line: 'border-l-emerald-500' },
  violet: { dot: 'bg-violet-500', panel: 'bg-violet-50 text-violet-700 ring-violet-100', icon: 'text-violet-600', line: 'border-l-violet-500' },
  slate: { dot: 'bg-slate-500', panel: 'bg-slate-100 text-slate-700 ring-slate-200', icon: 'text-slate-600', line: 'border-l-slate-500' },
}

const toneOptions: Array<{ value: ProjectTone; label: string }> = [
  { value: 'blue', label: '蓝色' },
  { value: 'green', label: '绿色' },
  { value: 'violet', label: '紫色' },
  { value: 'slate', label: '石板灰' },
]

const autoBackupDirectoryStorageKey = 'deek-pm.auto-backup-dir.v1'
const autoBackupErrorStorageKey = 'deek-pm.auto-backup-error.v1'
const autoBackupPasswordStorageKey = 'deek-pm.auto-backup-password.v1'
const localBackupStorageKey = 'deek-pm.local-backup.v1'
const encryptedFieldPrefix = 'deek-safe:v1:'
const emptyWorkspaces: Workspace[] = []
const emptyProjects: Project[] = []
const emptyQuickEntries: QuickEntry[] = []
const standardEase = [0.22, 1, 0.36, 1] as const

export function RootLayout() {
  return (
    <>
      <WindowControls />
      <Outlet />
    </>
  )
}

export function LaunchPage() {
  const repositories = useRepositories()
  const runtimeConfig = useRuntimeConfig()
  const queryClient = useQueryClient()
  const [unlockPassword, setUnlockPassword] = useState('')
  const [rememberUnlock, setRememberUnlock] = useState(true)
  const [unlockMessage, setUnlockMessage] = useState('')
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false)
  const [serviceDeployment, setServiceDeployment] = useState<'cloud' | 'selfhost'>('cloud')
  const [serviceUrl, setServiceUrl] = useState(officialServiceUrl)
  const [serviceEmail, setServiceEmail] = useState('')
  const [servicePassword, setServicePassword] = useState('')
  const [serviceMessage, setServiceMessage] = useState('')
  const [connectingService, setConnectingService] = useState(false)
  const { data: securityStatus = null } = useQuery({
    queryKey: ['local-security-status'],
    queryFn: async () => (await window.deek?.getLocalSecurityStatus?.())?.data ?? null,
  })
  const locked = runtimeConfig.config.kind === 'local' && Boolean(securityStatus?.configured && securityStatus.locked)
  const { data: workspaces = emptyWorkspaces, error: workspacesError } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => repositories.workspace.listWorkspaces(),
    enabled: !locked,
  })
  const local = workspaces.find((workspace) => workspace.type === 'local')
  const cloud = workspaces.filter((workspace) => workspace.type === 'service' && workspace.deployment === 'cloud')
  const selfhost = workspaces.filter((workspace) => workspace.type === 'service' && workspace.deployment === 'selfhost')
  const savedCloud = runtimeConfig.savedConnections.filter((connection) => connection.deployment === 'cloud')
  const savedSelfhost = runtimeConfig.savedConnections.filter((connection) => connection.deployment === 'selfhost')

  const connectService = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setConnectingService(true)
    setServiceMessage('')
    try {
      await runtimeConfig.connectService({
        baseUrl: serviceUrl,
        deployment: serviceDeployment,
        email: serviceEmail,
        password: servicePassword,
      })
      queryClient.clear()
      setServicePassword('')
      setServiceDialogOpen(false)
    } catch (error) {
      setServiceMessage(error instanceof Error ? error.message : '连接服务失败')
    } finally {
      setConnectingService(false)
    }
  }

  const activateSavedConnection = async (connection: SavedServiceConnection) => {
    setConnectingService(true)
    setServiceMessage('')
    try {
      await runtimeConfig.activateSavedService(connection.id)
      queryClient.clear()
    } catch (error) {
      setServiceDeployment(connection.deployment)
      setServiceUrl(connection.baseUrl)
      setServiceEmail(connection.accountEmail)
      setServicePassword('')
      setServiceMessage(error instanceof Error ? error.message : '连接服务失败，请重新登录')
      setServiceDialogOpen(true)
    } finally {
      setConnectingService(false)
    }
  }

  const unlockLocal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const result = await window.deek?.unlockLocalDatabase?.({ password: unlockPassword, remember: rememberUnlock })
    if (!result?.ok) {
      setUnlockMessage(result?.error ?? '解锁失败')
      return
    }
    setUnlockPassword('')
    setUnlockMessage('')
    await runtimeConfig.refreshSavedServices()
    await queryClient.invalidateQueries()
  }

  const switchToLocalMode = () => {
    runtimeConfig.useLocalMode()
    queryClient.clear()
    void runtimeConfig.refreshSavedServices()
    window.location.hash = '#/'
  }

  const openNewServiceDialog = (deployment: 'cloud' | 'selfhost' = 'selfhost') => {
    setServiceDeployment(deployment)
    setServiceUrl(deployment === 'cloud' ? officialServiceUrl : 'http://127.0.0.1:3100')
    setServiceEmail('')
    setServicePassword('')
    setServiceMessage('')
    setServiceDialogOpen(true)
  }

  if (locked) {
    return (
      <main className="grid min-h-screen place-items-center deek-app-bg p-10 text-foreground">
        <WindowDragStrip />
        <Card className="w-[420px] p-6">
          <div className="grid h-12 w-12 place-items-center rounded-[var(--radius-control)] border border-[var(--glass-border)] bg-[image:var(--button-primary-bg)] text-foreground shadow-[var(--glass-highlight)]">
            <ShieldCheck size={24} />
          </div>
          <h1 className="mt-5 text-xl font-semibold">本地个人库已锁定</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            输入主密码解锁本机库。已保存的服务连接也保存在本地加密库中，解锁后仍可一键进入，不会因为切到离线模式而丢失。
          </p>
          {runtimeConfig.savedConnections.length > 0 && (
            <div className="mt-4 rounded-md border bg-[var(--surface-muted)] p-3 text-sm text-muted-foreground">
              本机已保存 {runtimeConfig.savedConnections.length} 个服务连接
              （云端 {savedCloud.length} · 自部署 {savedSelfhost.length}），解锁后显示在启动页。
            </div>
          )}
          {unlockMessage && <div className="mt-4 rounded-md border bg-[var(--surface-muted)] p-3 text-sm text-muted-foreground">{unlockMessage}</div>}
          <form className="mt-5 grid gap-4" onSubmit={unlockLocal}>
            <TextInput label="主密码" type="password" value={unlockPassword} onChange={(event) => setUnlockPassword(event.target.value)} />
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={rememberUnlock} onChange={(event) => setRememberUnlock(event.target.checked)} />
              记住本机解锁
            </label>
            <Button type="submit" size="lg" disabled={unlockPassword.length < 8}>
              <ShieldCheck size={17} />
              解锁
            </Button>
          </form>
        </Card>
      </main>
    )
  }

  return (
    <main className="deek-app-bg min-h-screen px-8 pb-8 pt-14 text-foreground">
      <WindowDragStrip />
      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="deek-glass-strong rounded-[var(--radius-dialog)] border p-6">
          <div className="flex items-center gap-3">
            <img src={deekLogoMark} alt="Deek PM" className="h-10 w-10 rounded-lg object-cover shadow-[var(--shadow-control)]" />
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold">Deek PM</h1>
              <p className="mt-1 text-sm text-muted-foreground">本地库与服务连接相互独立：切换模式不会删除已保存的服务登录。</p>
            </div>
          </div>
          <div className="mt-7 grid gap-3 md:grid-cols-3">
            <LaunchMetric icon={HardDrive} label="本地库" value={runtimeConfig.config.kind === 'local' ? '当前模式' : '可切换'} helper={local?.name ?? '纯离线 SQLCipher'} />
            <LaunchMetric icon={Cloud} label="云端连接" value={`${savedCloud.length}`} helper="已保存，可随时重进" />
            <LaunchMetric icon={Server} label="自部署" value={`${savedSelfhost.length}`} helper="已保存，可随时重进" />
          </div>
        </div>
        <div className="deek-glass rounded-[var(--radius-dialog)] border p-5 text-foreground">
          <span className="grid h-10 w-10 place-items-center rounded-[var(--radius-control)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] text-muted-foreground">
            {runtimeConfig.config.kind === 'local' ? <HardDrive size={18} /> : runtimeConfig.config.deployment === 'cloud' ? <Cloud size={18} /> : <Server size={18} />}
          </span>
          <h2 className="mt-4 text-base font-semibold">{runtimeConfig.config.kind === 'local' ? '当前使用纯离线模式' : '当前已连接服务端'}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {runtimeConfig.config.kind === 'local'
              ? '正在浏览本机 SQLCipher 数据。下方「已保存服务连接」仍保留，可随时点回去。'
              : `${runtimeConfig.config.accountEmail} · ${runtimeConfig.config.baseUrl}`}
          </p>
          {runtimeConfig.config.kind === 'local' && local ? (
            <Button asChild className="mt-5 w-full">
              <Link to="/workspace/$workspaceId" params={{ workspaceId: local.id }}>
                <HardDrive size={16} />
                进入本地库
              </Link>
            </Button>
          ) : null}
          {runtimeConfig.config.kind === 'server' && (cloud[0] || selfhost[0]) ? (
            <Button asChild className="mt-5 w-full">
              <Link to="/workspace/$workspaceId" params={{ workspaceId: (cloud[0] ?? selfhost[0])!.id }}>
                {runtimeConfig.config.deployment === 'cloud' ? <Cloud size={16} /> : <Server size={16} />}
                进入当前服务资料库
              </Link>
            </Button>
          ) : null}
          <Button
            variant="outline"
            className="mt-2 w-full border-[var(--button-border)] bg-[var(--button-bg)] text-foreground hover:bg-[var(--button-hover-bg)] hover:text-foreground"
            onClick={() => {
              if (runtimeConfig.config.kind === 'server') {
                switchToLocalMode()
                return
              }
              openNewServiceDialog(savedSelfhost.length > 0 || savedCloud.length === 0 ? 'selfhost' : 'cloud')
            }}
          >
            {runtimeConfig.config.kind === 'local' ? <Plus size={16} /> : <HardDrive size={16} />}
            {runtimeConfig.config.kind === 'local' ? '新增服务连接' : '切换到本地库（保留连接）'}
          </Button>
          {runtimeConfig.config.kind === 'server' && (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">仅切换当前工作模式，不会删除下方已保存的服务连接。</p>
          )}
        </div>
      </section>
      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          {workspacesError && <div className="mb-5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{workspacesError instanceof Error ? workspacesError.message : '读取工作空间失败'}</div>}
          {runtimeConfig.config.kind === 'local' && local && (
            <WorkspaceSection title="本地资料库" description="纯离线数据，只存在本机。">
              <WorkspaceCard workspace={local} featured />
            </WorkspaceSection>
          )}
          {runtimeConfig.config.kind === 'server' && (cloud.length > 0 || selfhost.length > 0) && (
            <WorkspaceSection
              title="当前服务资料库"
              description="这是当前登录会话下的服务端工作空间。切到本地库后这里会暂时隐藏，请从「已保存服务连接」重新进入。"
            >
              <WorkspaceGrid>
                {cloud.map((workspace) => <WorkspaceCard key={workspace.id} workspace={workspace} />)}
                {selfhost.map((workspace) => <WorkspaceCard key={workspace.id} workspace={workspace} />)}
              </WorkspaceGrid>
            </WorkspaceSection>
          )}
          <WorkspaceSection
            title="已保存服务连接"
            description="连接记录保存在本机加密库中，与当前是本地还是服务模式无关。删除连接才会真正移除。"
          >
            {runtimeConfig.savedConnections.length > 0 ? (
              <WorkspaceGrid>
                {runtimeConfig.savedConnections.map((connection) => (
                  <SavedServiceCard
                    key={connection.id}
                    connection={connection}
                    current={runtimeConfig.config.kind === 'server' && runtimeConfig.config.baseUrl === connection.baseUrl && runtimeConfig.config.accountEmail === connection.accountEmail}
                    onOpen={() => void activateSavedConnection(connection)}
                    onDelete={() => {
                      void runtimeConfig.deleteSavedService(connection.id).then(() => queryClient.clear())
                    }}
                  />
                ))}
                <button
                  type="button"
                  className="flex min-h-28 items-center gap-3 rounded-[var(--radius-dialog)] border border-dashed bg-background/60 px-4 text-sm text-muted-foreground hover:bg-muted"
                  onClick={() => openNewServiceDialog('selfhost')}
                >
                  <Plus size={18} />
                  新增连接
                </button>
              </WorkspaceGrid>
            ) : (
              <div className="deek-glass rounded-[var(--radius-dialog)] border border-dashed p-5">
                <p className="text-sm text-muted-foreground">还没有保存过服务连接。连接成功后会出现在这里；之后即使切回本地库，也可以一键重连。</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => openNewServiceDialog('cloud')}>
                    <Cloud size={16} />
                    连接官方云服务
                  </Button>
                  <Button type="button" variant="outline" onClick={() => openNewServiceDialog('selfhost')}>
                    <Server size={16} />
                    连接自部署服务
                  </Button>
                </div>
              </div>
            )}
          </WorkspaceSection>
        </div>
        <aside className="deek-glass rounded-[var(--radius-dialog)] border p-5">
          <h2 className="text-base font-semibold">模式说明</h2>
          <div className="mt-4 grid gap-3">
            <LaunchStep icon={HardDrive} title="本地库" text="数据只在本机。切换到本地不会影响已保存的服务登录。" />
            <LaunchStep icon={Server} title="服务连接" text="登录后写入「已保存服务连接」。会话过期时点卡片重新输入密码即可。" />
            <LaunchStep icon={Download} title="迁移与备份" text="本地库可导出备份；迁到线上不会自动删本地数据。" />
          </div>
        </aside>
      </section>
      <Dialog open={serviceDialogOpen} onOpenChange={setServiceDialogOpen}>
        <DialogContent>
          <form onSubmit={connectService}>
            <DialogHeader>
              <DialogTitle>连接 Deek PM 服务</DialogTitle>
              <DialogDescription>官方服务与自部署服务使用完全相同的 API，客户端只需要切换服务地址。</DialogDescription>
            </DialogHeader>
            <div className="mt-5 grid gap-4">
              <div className="grid gap-2">
                <Label>服务类型</Label>
                <Select
                  value={serviceDeployment}
                  onValueChange={(value) => {
                    const deployment = value as 'cloud' | 'selfhost'
                    setServiceDeployment(deployment)
                    if (deployment === 'cloud') setServiceUrl(officialServiceUrl)
                  }}
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cloud">官方云服务</SelectItem>
                    <SelectItem value="selfhost">自部署服务</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <TextInput
                label="服务地址"
                value={serviceUrl}
                onChange={(event) => setServiceUrl(event.target.value)}
                placeholder="https://pm.example.com"
              />
              <TextInput label="账号邮箱" type="email" value={serviceEmail} onChange={(event) => setServiceEmail(event.target.value)} />
              <TextInput label="密码" type="password" value={servicePassword} onChange={(event) => setServicePassword(event.target.value)} />
              {serviceMessage && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{serviceMessage}</div>}
            </div>
            <DialogFooter className="mt-6">
              <DialogClose asChild><Button type="button" variant="outline">取消</Button></DialogClose>
              <Button type="submit" disabled={connectingService || !serviceUrl || !serviceEmail || servicePassword.length < 8}>
                {connectingService ? '正在连接…' : '连接并登录'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  )
}

export function WorkspaceLayout() {
  const repositories = useRepositories()
  const { workspaceId = '' } = useParams({ strict: false })
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const isProjectRoute = Boolean(getCurrentProjectId(pathname))
  const { data: workspace, error, isPending } = useQuery({ queryKey: ['workspace', workspaceId], queryFn: () => repositories.workspace.getWorkspace(workspaceId) })
  if (isPending) return <main className="grid min-h-screen place-items-center deek-app-bg text-sm text-muted-foreground">正在加载资料库…</main>
  if (error || !workspace) {
    return (
      <main className="grid min-h-screen place-items-center deek-app-bg p-8">
        <Card className="max-w-md p-6 text-center">
          <Info className="mx-auto text-muted-foreground" size={28} />
          <h1 className="mt-4 text-lg font-semibold">无法打开资料库</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error instanceof Error ? error.message : '资料库不存在或已无法访问。'}</p>
          <Button asChild className="mt-5"><Link to="/">返回首页</Link></Button>
        </Card>
      </main>
    )
  }
  return (
    <AppShell topbar={<TopBar workspace={workspace} />} sidebar={isProjectRoute ? undefined : <Sidebar workspace={workspace} />}>
      <Outlet />
    </AppShell>
  )
}

export function ProjectsPage() {
  const repositories = useRepositories()
  const queryClient = useQueryClient()
  const { workspaceId = '' } = useParams({ strict: false })
  const [viewMode, setViewMode] = useState<ProjectViewMode>('list')
  const [sortMode, setSortMode] = useState<ProjectSortMode>('updated')
  const [createOpen, setCreateOpen] = useState(false)
  const [formValues, setFormValues] = useState<ProjectFormValues>({ name: '', description: '', tag: '', tone: 'blue' })
  const { data: workspace } = useQuery({ queryKey: ['workspace', workspaceId], queryFn: () => repositories.workspace.getWorkspace(workspaceId) })
  const { data: projects = emptyProjects } = useQuery({ queryKey: ['projects', workspaceId], queryFn: () => repositories.project.listProjects(workspaceId) })
  const { data: quickEntries = emptyQuickEntries } = useQuery({ queryKey: ['quick-entries', workspaceId], queryFn: () => repositories.quickEntry.listQuickEntries(workspaceId) })
  const createProjectMutation = useMutation({
    mutationFn: (input: ProjectFormValues) =>
      repositories.project.createProject({
        workspaceId,
        name: input.name.trim(),
        description: input.description.trim() || '新的项目资料空间。',
        tag: input.tag.trim() || (workspace?.type === 'local' ? '本地项目' : '服务端项目'),
        tone: input.tone,
      }),
    onSuccess: () => {
      setCreateOpen(false)
      setFormValues({ name: '', description: '', tag: '', tone: workspace?.type === 'local' ? 'blue' : 'violet' })
      void queryClient.invalidateQueries({ queryKey: ['projects', workspaceId] })
    },
  })
  const sortedProjects = useMemo(() => {
    return [...projects].sort((a, b) => {
      if (sortMode === 'name') return a.name.localeCompare(b.name, 'zh-Hans-CN')
      if (sortMode === 'entries') return b.entryCount - a.entryCount
      return 0
    })
  }, [projects, sortMode])
  const publishedQuickEntries = useMemo(() => quickEntries.filter((entry) => entry.published), [quickEntries])
  if (!workspace) return null

  const handleOpenCreate = () => {
    setFormValues((current) => ({
      ...current,
      tag: current.tag || (workspace.type === 'local' ? '本地项目' : '服务端项目'),
      tone: current.tone || (workspace.type === 'local' ? 'blue' : 'violet'),
    }))
    setCreateOpen(true)
  }
  const handleCreateProject = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!formValues.name.trim()) return
    createProjectMutation.mutate(formValues)
  }

  return (
    <main className="deek-app-bg h-full overflow-auto p-6">
      <section className="deek-glass-strong rounded-[var(--radius-dialog)] border px-5 py-4">
        <PageHeader
          eyebrow={workspaceLabel(workspace)}
          title="项目"
          description="集中管理项目说明、智库资料、账号、链接和本地附件索引。"
          actions={
            <>
              <Badge variant="outline">{deploymentLabel(workspace)}</Badge>
              <Button disabled={createProjectMutation.isPending} onClick={handleOpenCreate}>
                <Plus size={16} />
                新建项目
              </Button>
            </>
          }
        />
      </section>
      <div className="mt-5 grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <QuickEntryShelf workspaceId={workspaceId} entries={publishedQuickEntries} className="xl:sticky xl:top-5 xl:self-start" />
        <section className="min-w-0">
          <div className="deek-glass sticky top-3 z-10 flex items-center justify-between rounded-[var(--radius-panel)] border px-3 py-2">
            <div className="flex rounded-[var(--radius-control)] border border-[var(--glass-border)] bg-[var(--glass-bg)] p-1 backdrop-blur-[var(--glass-blur)]">
              <Button size="icon" variant={viewMode === 'grid' ? 'secondary' : 'ghost'} aria-label="网格视图" onClick={() => setViewMode('grid')}>
                <Grid2X2 size={16} />
              </Button>
              <Button size="icon" variant={viewMode === 'list' ? 'secondary' : 'ghost'} aria-label="列表视图" onClick={() => setViewMode('list')}>
                <List size={16} />
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">{projects.length} 个项目</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" aria-label="排序">
                    <ArrowUpDown size={16} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuLabel>排序方式</DropdownMenuLabel>
                  <DropdownMenuItem onSelect={() => setSortMode('updated')}>最近更新</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setSortMode('name')}>项目名称</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setSortMode('entries')}>资料数量</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <LazyMotion features={domAnimation}>
            <m.section layout className={cn('mt-4 grid gap-2.5', viewMode === 'grid' ? 'grid-cols-[repeat(auto-fit,minmax(320px,1fr))]' : 'grid-cols-1')}>
              {sortedProjects.map((project) => (
                <ProjectCard key={project.id} project={project} workspaceId={workspaceId} viewMode={viewMode} />
              ))}
            </m.section>
          </LazyMotion>
          {sortedProjects.length === 0 && (
            <Card className="mt-4 grid min-h-72 place-items-center p-8 text-center">
              <div>
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-lg border bg-[var(--surface-muted)] text-muted-foreground">
                  <Folder size={20} />
                </span>
                <h2 className="mt-4 text-lg font-semibold">还没有项目</h2>
                <p className="mt-2 text-sm text-muted-foreground">创建第一个本地项目，用来收纳资料、账号、链接和附件。</p>
                <Button className="mt-5" onClick={handleOpenCreate}>
                  <Plus size={16} />
                  新建项目
                </Button>
              </div>
            </Card>
          )}
        </section>
      </div>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleCreateProject}>
            <DialogHeader>
              <DialogTitle>新建项目</DialogTitle>
              <DialogDescription>给项目资料空间补上名称、分类和简短说明。</DialogDescription>
            </DialogHeader>
            <ProjectForm value={formValues} workspace={workspace} onChange={setFormValues} />
            <DialogFooter className="mt-6">
              <DialogClose asChild>
                <Button type="button" variant="outline">取消</Button>
              </DialogClose>
              <Button type="submit" disabled={!formValues.name.trim() || createProjectMutation.isPending}>
                {createProjectMutation.isPending ? '创建中' : '创建项目'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  )
}

export function ProjectStatsPage() {
  const repositories = useRepositories()
  const { workspaceId = '' } = useParams({ strict: false })
  const { data: workspace } = useQuery({ queryKey: ['workspace', workspaceId], queryFn: () => repositories.workspace.getWorkspace(workspaceId) })
  const { data: projects = emptyProjects } = useQuery({ queryKey: ['projects', workspaceId], queryFn: () => repositories.project.listProjects(workspaceId) })
  const { data: quickEntries = emptyQuickEntries } = useQuery({ queryKey: ['quick-entries', workspaceId], queryFn: () => repositories.quickEntry.listQuickEntries(workspaceId) })
  const totalEntryCount = useMemo(() => projects.reduce((total, project) => total + project.entryCount, 0), [projects])
  const publishedQuickEntryCount = useMemo(() => quickEntries.filter((entry) => entry.published).length, [quickEntries])
  const recentProject = projects[0]
  const topProjects = useMemo(() => [...projects].sort((a, b) => b.entryCount - a.entryCount).slice(0, 6), [projects])
  const tagStats = useMemo(() => {
    const stats = new Map<string, number>()
    for (const project of projects) stats.set(project.tag || '未分类', (stats.get(project.tag || '未分类') ?? 0) + 1)
    return [...stats.entries()].sort((a, b) => b[1] - a[1])
  }, [projects])

  if (!workspace) return null

  return (
    <main className="deek-app-bg h-full overflow-auto p-6">
      <section className="deek-glass-strong rounded-[var(--radius-dialog)] border px-5 py-4">
        <PageHeader
          eyebrow={workspaceLabel(workspace)}
          title="项目统计信息"
          description="查看当前工作区的项目数量、资料沉淀和快捷入口上架情况。"
          actions={<Badge variant="outline">{deploymentLabel(workspace)}</Badge>}
        />
      </section>
      <section className="mt-5 grid gap-3 lg:grid-cols-4">
        <ProjectStatCard icon={Folder} label="项目空间" value={`${projects.length}`} helper={workspace.type === 'local' ? '本机资料索引' : '团队协作空间'} />
        <ProjectStatCard icon={Database} label="智库条目" value={`${totalEntryCount}`} helper="文本、账号、链接统一收纳" />
        <ProjectStatCard icon={Pin} label="上架入口" value={`${publishedQuickEntryCount}`} helper={`${quickEntries.length} 个入口已纳入管理`} />
        <ProjectStatCard icon={CalendarClock} label="最近更新" value={recentProject?.updatedAtText ?? '-'} helper={recentProject?.name ?? '暂无项目'} />
      </section>
      <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="p-4">
          <h2 className="text-base font-semibold">资料量排行</h2>
          <div className="mt-4 grid gap-2">
            {topProjects.map((project) => (
              <div key={project.id} className="grid grid-cols-[minmax(0,1fr)_80px] items-center rounded-md border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2">
                <span className="min-w-0">
                  <strong className="block truncate text-sm">{project.name}</strong>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">{project.tag}</span>
                </span>
                <span className="text-right text-sm font-medium">{project.entryCount}</span>
              </div>
            ))}
            {topProjects.length === 0 && <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">暂无项目统计数据</p>}
          </div>
        </Card>
        <Card className="p-4">
          <h2 className="text-base font-semibold">项目标签</h2>
          <div className="mt-4 grid gap-2">
            {tagStats.map(([tag, count]) => (
              <div key={tag} className="flex items-center justify-between rounded-md bg-[var(--surface-muted)] px-3 py-2 text-sm">
                <span className="truncate">{tag}</span>
                <Badge variant="outline">{count}</Badge>
              </div>
            ))}
            {tagStats.length === 0 && <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">暂无标签数据</p>}
          </div>
        </Card>
      </section>
    </main>
  )
}

interface QuickEntryFormValues {
  name: string
  target: string
  targetType: QuickEntryTargetType
  published: boolean
}

export function QuickEntriesPage() {
  const repositories = useRepositories()
  const queryClient = useQueryClient()
  const { workspaceId = '' } = useParams({ strict: false })
  const { data: workspace } = useQuery({ queryKey: ['workspace', workspaceId], queryFn: () => repositories.workspace.getWorkspace(workspaceId) })
  const { data: quickEntries = emptyQuickEntries } = useQuery({ queryKey: ['quick-entries', workspaceId], queryFn: () => repositories.quickEntry.listQuickEntries(workspaceId) })
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<QuickEntry | null>(null)
  const [formValues, setFormValues] = useState<QuickEntryFormValues>({ name: '', target: '', targetType: 'file', published: true })
  const [pathPickerMessage, setPathPickerMessage] = useState('')
  const [quickEntryMessage, setQuickEntryMessage] = useState('')
  const queryKey = ['quick-entries', workspaceId]

  const createQuickEntryMutation = useMutation({
    mutationFn: (input: QuickEntryFormValues) =>
      repositories.quickEntry.createQuickEntry({
        workspaceId,
        name: input.name.trim(),
        target: input.target.trim(),
        targetType: input.targetType,
        published: input.published,
      }),
    onSuccess: () => {
      setDialogOpen(false)
      setEditingEntry(null)
      setFormValues({ name: '', target: '', targetType: 'file', published: true })
      setQuickEntryMessage('')
      void queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) => setQuickEntryMessage(getErrorMessage(error, '快捷入口保存失败')),
  })
  const updateQuickEntryMutation = useMutation({
    mutationFn: (input: QuickEntryFormValues & { id: string }) =>
      repositories.quickEntry.updateQuickEntry({
        id: input.id,
        name: input.name.trim(),
        target: input.target.trim(),
        targetType: input.targetType,
        published: input.published,
      }),
    onSuccess: () => {
      setDialogOpen(false)
      setEditingEntry(null)
      setQuickEntryMessage('')
      void queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) => setQuickEntryMessage(getErrorMessage(error, '快捷入口保存失败')),
  })
  const toggleQuickEntryMutation = useMutation({
    mutationFn: (entry: QuickEntry) => repositories.quickEntry.updateQuickEntry({ id: entry.id, published: !entry.published }),
    onSuccess: () => {
      setQuickEntryMessage('')
      void queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) => setQuickEntryMessage(getErrorMessage(error, '快捷入口状态更新失败')),
  })
  const deleteQuickEntryMutation = useMutation({
    mutationFn: (id: string) => repositories.quickEntry.deleteQuickEntry(id),
    onSuccess: () => {
      setQuickEntryMessage('')
      void queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) => setQuickEntryMessage(getErrorMessage(error, '快捷入口删除失败')),
  })

  if (!workspace) return null

  const openCreateDialog = () => {
    setEditingEntry(null)
    setFormValues({ name: '', target: '', targetType: 'file', published: true })
    setPathPickerMessage('')
    setQuickEntryMessage('')
    setDialogOpen(true)
  }
  const openEditDialog = (entry: QuickEntry) => {
    setEditingEntry(entry)
    setFormValues({ name: entry.name, target: entry.target, targetType: entry.targetType, published: entry.published })
    setPathPickerMessage('')
    setQuickEntryMessage('')
    setDialogOpen(true)
  }
  const choosePath = async (kind: 'file' | 'directory' | 'any') => {
    if (!window.deek?.selectPath) {
      setPathPickerMessage('当前是 Web 预览环境，不能调用系统文件选择器。可以手动输入路径或网址；桌面端会正常弹出选择窗口。')
      return
    }
    const target = await window.deek.selectPath({ kind, title: kind === 'directory' ? '选择文件夹' : '选择文件或快捷方式' })
    if (!target) return
    const stat = await window.deek?.statPath?.(target)
    const targetType = inferQuickEntryTargetType(target, stat ?? null)
    setPathPickerMessage('')
    setFormValues((current) => ({
      ...current,
      target,
      targetType,
      name: current.name.trim() ? current.name : getDefaultQuickEntryName(target),
    }))
  }
  const submitQuickEntry = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!formValues.name.trim() || !formValues.target.trim()) return
    setQuickEntryMessage('')
    if (editingEntry) {
      updateQuickEntryMutation.mutate({ ...formValues, id: editingEntry.id })
      return
    }
    createQuickEntryMutation.mutate(formValues)
  }

  return (
    <main className="deek-app-bg h-full overflow-auto p-6">
      <section className="deek-glass-strong rounded-[var(--radius-dialog)] border px-5 py-4">
        <PageHeader
          eyebrow={workspaceLabel(workspace)}
          title="快捷入口管理"
          description="统一管理本地文件、文件夹、快捷方式和常用地址，上架后会显示在项目页。"
          actions={
            <Button onClick={openCreateDialog}>
              <Plus size={16} />
              新增入口
            </Button>
          }
        />
      </section>
      {quickEntryMessage && <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{quickEntryMessage}</div>}
      <Card className="mt-5 overflow-hidden p-0">
        <div className="grid grid-cols-[minmax(0,1fr)_120px_96px_176px] items-center border-b bg-[var(--surface-muted)] px-4 py-3 text-xs font-medium text-muted-foreground">
          <span>入口</span>
          <span>类型</span>
          <span>状态</span>
          <span className="text-right">操作</span>
        </div>
        <div className="divide-y">
          {quickEntries.map((entry) => {
            const Icon = quickEntryIcon(entry.targetType)
            return (
              <div key={entry.id} className="grid grid-cols-[minmax(0,1fr)_120px_96px_176px] items-center gap-3 px-4 py-3">
                <button type="button" className="flex min-w-0 items-center gap-3 text-left" onClick={() => openQuickEntry(entry)}>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-[var(--glass-border)] bg-[var(--glass-bg)] text-muted-foreground">
                    <Icon size={17} />
                  </span>
                  <span className="min-w-0">
                    <strong className="block truncate text-sm">{entry.name}</strong>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">{entry.target}</span>
                  </span>
                </button>
                <span className="text-sm text-muted-foreground">{quickEntryTypeLabel[entry.targetType]}</span>
                <Badge variant={entry.published ? 'default' : 'outline'}>{entry.published ? '已上架' : '未上架'}</Badge>
                <div className="flex justify-end gap-1">
                  <Button size="icon" variant="ghost" aria-label="打开" onClick={() => openQuickEntry(entry)}>
                    <ExternalLink size={15} />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label={entry.published ? '下架' : '上架'} onClick={() => toggleQuickEntryMutation.mutate(entry)}>
                    {entry.published ? <PinOff size={15} /> : <Pin size={15} />}
                  </Button>
                  <Button size="icon" variant="ghost" aria-label="编辑" onClick={() => openEditDialog(entry)}>
                    <Pencil size={15} />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label="删除" onClick={() => deleteQuickEntryMutation.mutate(entry.id)}>
                    <Trash2 size={15} />
                  </Button>
                </div>
              </div>
            )
          })}
          {quickEntries.length === 0 && (
            <div className="grid min-h-52 place-items-center p-8 text-center">
              <div>
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-lg border bg-[var(--surface-muted)] text-muted-foreground">
                  <Pin size={20} />
                </span>
                <h2 className="mt-4 text-lg font-semibold">还没有快捷入口</h2>
                <p className="mt-2 text-sm text-muted-foreground">选择本地文件、文件夹或快捷方式，上架后会出现在项目页。</p>
                <Button className="mt-5" onClick={openCreateDialog}>
                  <Plus size={16} />
                  新增入口
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <form onSubmit={submitQuickEntry}>
            <DialogHeader>
              <DialogTitle>{editingEntry ? '编辑快捷入口' : '新增快捷入口'}</DialogTitle>
              <DialogDescription>选择本地文件、文件夹或快捷方式，也可以手动填入一个地址。</DialogDescription>
            </DialogHeader>
            <QuickEntryForm value={formValues} pathPickerMessage={pathPickerMessage} onChange={setFormValues} onChoosePath={choosePath} />
            <DialogFooter className="mt-6">
              <DialogClose asChild>
                <Button type="button" variant="outline">取消</Button>
              </DialogClose>
              <Button type="submit" disabled={!formValues.name.trim() || !formValues.target.trim() || createQuickEntryMutation.isPending || updateQuickEntryMutation.isPending}>
                保存
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  )
}

type BackupActionKind = 'export' | 'restore' | 'auto' | 'migrate'

type BackupActionCard = {
  kind: BackupActionKind
  title: string
  subtitle: string
  icon: LucideIcon
  description: string
}

export function BackupPage() {
  const repositories = useRepositories()
  const queryClient = useQueryClient()
  const cards: BackupActionCard[] = [
    { kind: 'export', title: '加密备份', subtitle: '生成 .deekbak', icon: ShieldCheck, description: '输入备份密码后选择保存位置，生成一份加密备份文件。' },
    { kind: 'restore', title: '恢复备份', subtitle: '从备份文件恢复', icon: Download, description: '先选择 .deekbak 文件，再根据文件类型输入密码并预览恢复内容。' },
    { kind: 'auto', title: '自动备份', subtitle: '保存到固定目录', icon: Folder, description: '选择备份目录。之后本地数据写入时会自动节流备份。' },
    { kind: 'migrate', title: '迁移到线上', subtitle: '复制到个人服务空间', icon: Cloud, description: '将本地项目、正文图片、托管附件和快捷入口复制到官方或自部署服务。' },
  ]
  const runtimeConfig = useRuntimeConfig()
  const [activeAction, setActiveAction] = useState<BackupActionCard | null>(null)
  const [backupMessage, setBackupMessage] = useState('')
  const [backupPassword, setBackupPassword] = useState('')
  const [backupPasswordConfirm, setBackupPasswordConfirm] = useState('')
  const [restoreFile, setRestoreFile] = useState<{ filePath?: string; content: string; encrypted: boolean } | null>(null)
  const [restorePreview, setRestorePreview] = useState<{
    filePath?: string
    encrypted?: boolean
    payload: BackupPayload
    stats: { projects: number; groups: number; entries: number; attachments: number; exportedAt: string }
  } | null>(null)
  const [autoBackupDir, setAutoBackupDir] = useState(() => window.localStorage.getItem(autoBackupDirectoryStorageKey) ?? '')
  const [autoBackupError, setAutoBackupError] = useState(() => window.localStorage.getItem(autoBackupErrorStorageKey) ?? '')
  const [migrationDeployment, setMigrationDeployment] = useState<'cloud' | 'selfhost'>('selfhost')
  const [migrationUrl, setMigrationUrl] = useState('http://127.0.0.1:3100')
  const [migrationEmail, setMigrationEmail] = useState('')
  const [migrationPassword, setMigrationPassword] = useState('')
  const [migrationProgress, setMigrationProgress] = useState('')

  const resetRestoreSelection = () => {
    setRestoreFile(null)
    setRestorePreview(null)
    setBackupPassword('')
    setBackupPasswordConfirm('')
  }

  const runBackupAction = async () => {
    if (!activeAction) return

    if (activeAction.kind === 'export') {
      if (backupPassword.length < 8 || backupPassword !== backupPasswordConfirm) {
        setBackupMessage('备份密码至少需要 8 个字符，并且两次输入必须一致')
        return
      }
      const payload = await repositories.backup.exportBackup()
      const content = JSON.stringify(payload, null, 2)
      const omittedWarning = payload.omittedManagedAssets?.length
        ? `；${payload.omittedManagedAssets.length} 个大文件未内嵌，请同时备份物理存储目录`
        : ''
      if (window.deek?.writeEncryptedBackupFile) {
        const result = await window.deek.writeEncryptedBackupFile(content, backupPassword)
        setBackupMessage(result.ok ? `已保存：${result.filePath}${omittedWarning}` : result.canceled ? '已取消保存' : result.error ?? '保存失败')
        if (result.ok) {
          setBackupPassword('')
          setBackupPasswordConfirm('')
        }
      } else if (window.deek?.writeBackupFile) {
        const result = await window.deek.writeBackupFile(content)
        setBackupMessage(result.ok ? `当前环境不支持加密写入，已保存兼容备份：${result.filePath}` : result.canceled ? '已取消保存' : result.error ?? '保存失败')
      } else {
        const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
        const link = document.createElement('a')
        link.href = url
        link.download = `deek-backup-${new Date().toISOString().slice(0, 10)}.deekbak`
        link.click()
        URL.revokeObjectURL(url)
        setBackupMessage(`已生成浏览器下载${omittedWarning}`)
      }
      setActiveAction(null)
      return
    }

    if (activeAction.kind === 'restore') {
      if (restorePreview) {
        await repositories.backup.importBackup(restorePreview.payload)
        await queryClient.invalidateQueries()
        setBackupMessage(`已恢复：${restorePreview.filePath}`)
        resetRestoreSelection()
        setActiveAction(null)
        return
      }

      if (!restoreFile) {
        if (!window.deek?.readBackupFile) {
          setBackupMessage('Web 预览模式暂不支持读取本地备份文件')
          setActiveAction(null)
          return
        }
        const result = await window.deek.readBackupFile()
        if (!result.ok || !result.content) {
          setBackupMessage(result.canceled ? '已取消恢复' : result.error ?? '读取备份失败')
          return
        }
        const encrypted = isEncryptedBackupFileContent(result.content)
        setRestoreFile({ filePath: result.filePath, content: result.content, encrypted })
        if (encrypted) {
          setBackupMessage('已选择加密备份文件，请输入至少 8 个字符的备份密码')
          return
        }
        const payload = await normalizeBackupPayload(JSON.parse(result.content))
        setRestorePreview({ filePath: result.filePath, encrypted: false, payload, stats: getBackupStats(payload) })
        setBackupMessage('已选择兼容备份文件，请确认预览后恢复')
        return
      }

      if (restoreFile.encrypted) {
        if (backupPassword.length < 8) {
          setBackupMessage('备份密码至少需要 8 个字符')
          return
        }
        const result = await window.deek?.decryptBackupContent?.(restoreFile.content, backupPassword)
        if (!result?.ok || !result.content) {
          setBackupMessage(result?.error ?? '备份密码不正确或备份文件已损坏')
          return
        }
        const payload = await normalizeBackupPayload(JSON.parse(result.content))
        setRestorePreview({ filePath: restoreFile.filePath, encrypted: true, payload, stats: getBackupStats(payload) })
        setBackupMessage('备份已解密，请确认预览后恢复')
        return
      }
    }

    if (activeAction.kind === 'migrate') {
      try {
        setMigrationProgress('正在读取本地资料…')
        const baseUrl = normalizeServiceUrl(migrationUrl)
        const instance = await getServiceInstance(baseUrl)
        if (migrationDeployment === 'cloud' && instance.deployment !== 'cloud') throw new Error('该地址不是官方云服务实例')
        const login = await loginToService(baseUrl, migrationEmail.trim(), migrationPassword)
        const target = createServerRepositories({ baseUrl, deployment: instance.deployment, accessToken: login.accessToken })
        const payload = await repositories.backup.exportBackup()
        const result = await migrateLocalBackupToService(payload, target, setMigrationProgress)
        setBackupMessage(`迁移完成：${result.projects} 个项目、${result.entries} 条资料、${result.assets} 个文件、${result.attachments} 个附件。${result.skippedPathAttachments ? `已跳过 ${result.skippedPathAttachments} 个仅本机可用的路径引用。` : ''}`)
        await runtimeConfig.connectService({ baseUrl, deployment: instance.deployment, email: migrationEmail.trim(), password: migrationPassword })
        window.location.hash = '#/'
      } catch (error) {
        setBackupMessage(error instanceof Error ? `迁移失败：${error.message}` : '迁移失败')
        setMigrationProgress('')
      }
      return
    }

    if (activeAction.kind === 'auto') {
      if (!window.deek?.selectBackupDir || !window.deek?.writeEncryptedBackupToDirectory || !window.deek.safeEncryptText) {
        setBackupMessage('当前环境不支持选择自动备份目录')
        setActiveAction(null)
        return
      }
      const selectedDirectory = await window.deek.selectBackupDir()
      if (!selectedDirectory) {
        setBackupMessage('已取消自动备份设置')
        setActiveAction(null)
        return
      }
      const encryptedPassword = await window.deek.safeEncryptText(backupPassword)
      if (!encryptedPassword) {
        setBackupMessage('系统安全存储不可用，无法安全保存自动备份密码')
        setActiveAction(null)
        return
      }
      const result = await window.deek.writeEncryptedBackupToDirectory(selectedDirectory, JSON.stringify(await repositories.backup.exportBackup()), backupPassword)
      window.localStorage.setItem(autoBackupDirectoryStorageKey, selectedDirectory)
      window.localStorage.setItem(autoBackupPasswordStorageKey, encryptedPassword)
      if (result.ok) window.localStorage.removeItem(autoBackupErrorStorageKey)
      setAutoBackupDir(selectedDirectory)
      setAutoBackupError(result.ok ? '' : result.error ?? 'Auto backup failed')
      setBackupMessage(result.ok ? `已开启自动备份：${selectedDirectory}` : result.error ?? '自动备份写入失败')
      setActiveAction(null)
      return
    }

    setActiveAction(null)
  }

  const disableAutoBackup = () => {
    window.localStorage.removeItem(autoBackupDirectoryStorageKey)
    window.localStorage.removeItem(autoBackupErrorStorageKey)
    window.localStorage.removeItem(autoBackupPasswordStorageKey)
    setAutoBackupDir('')
    setAutoBackupError('')
    setBackupMessage('已关闭自动备份')
  }

  const backupActionDisabled =
    (activeAction?.kind === 'export' && (backupPassword.length < 8 || backupPassword !== backupPasswordConfirm)) ||
    (activeAction?.kind === 'restore' && Boolean(restoreFile?.encrypted) && !restorePreview && backupPassword.length < 8) ||
    (activeAction?.kind === 'auto' && (backupPassword.length < 8 || backupPassword !== backupPasswordConfirm))

  const backupActionLabel = (() => {
    if (activeAction?.kind === 'export') return '选择保存位置并备份'
    if (activeAction?.kind === 'restore') {
      if (!restoreFile) return '选择备份文件'
      if (!restorePreview && restoreFile.encrypted) return '解密并预览'
      return '确认恢复'
    }
    if (activeAction?.kind === 'auto') return '选择目录并立即备份'
    if (activeAction?.kind === 'migrate') return '开始迁移'
    return '继续'
  })()

  return (
    <main className="h-full overflow-auto p-6">
      <PageHeader title="备份与迁移" description="本地模式的数据导出、恢复、自动备份和后续迁移入口。" />
      {backupMessage && <div className="mt-5 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">{backupMessage}</div>}
      <Card className="mt-5 flex items-center justify-between gap-4 p-4">
        <div>
          <h2 className="text-sm font-semibold">自动备份路径</h2>
          <p className="mt-1 break-all text-sm text-muted-foreground">{autoBackupDir || '未设置自动备份目录'}</p>
          {autoBackupError && <p className="mt-1 text-sm text-destructive">{autoBackupError}</p>}
        </div>
        {autoBackupDir && <Button variant="outline" onClick={disableAutoBackup}>关闭自动备份</Button>}
      </Card>
      <section className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ kind, title, subtitle, icon: Icon, description }) => (
          <button key={kind} className="rounded-lg border bg-background p-4 text-left shadow-[var(--shadow-control)] transition hover:border-foreground/20 hover:shadow-[var(--shadow-panel)]" onClick={() => setActiveAction({ kind, title, subtitle, icon: Icon, description })}>
            <span className="grid h-10 w-10 place-items-center rounded-md border bg-[var(--surface-muted)] text-muted-foreground">
              <Icon size={18} />
            </span>
            <h2 className="mt-4 font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">{description}</p>
          </button>
        ))}
      </section>
      <Dialog
        open={Boolean(activeAction)}
        onOpenChange={(open) => {
          if (open) return
          setActiveAction(null)
          setBackupPassword('')
          setBackupPasswordConfirm('')
          setRestoreFile(null)
          setRestorePreview(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{activeAction?.title}</DialogTitle>
            <DialogDescription>{activeAction?.description}</DialogDescription>
          </DialogHeader>
          {activeAction?.kind === 'export' && (
            <div className="grid gap-4">
              <TextInput label="备份密码" type="password" value={backupPassword} onChange={(event) => setBackupPassword(event.target.value)} />
              <TextInput label="确认备份密码" type="password" value={backupPasswordConfirm} onChange={(event) => setBackupPasswordConfirm(event.target.value)} />
              <p className="text-sm text-muted-foreground">密码至少 8 个字符。点击确认后会弹出保存位置选择窗口。</p>
            </div>
          )}
          {activeAction?.kind === 'restore' && (
            <div className="grid gap-4">
              {!restoreFile && <p className="text-sm text-muted-foreground">点击“选择备份文件”后选择 .deekbak 或 .json 文件；如果文件已加密，再输入备份密码。</p>}
              {restoreFile && (
                <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
                  <InfoRow label="备份文件" value={restoreFile.filePath ?? '-'} />
                  <InfoRow label="备份类型" value={restoreFile.encrypted ? '加密备份' : '兼容备份'} />
                </div>
              )}
              {restoreFile?.encrypted && !restorePreview && (
                <div className="grid gap-2">
                  <TextInput label="备份密码" type="password" value={backupPassword} onChange={(event) => setBackupPassword(event.target.value)} />
                  <p className="text-sm text-muted-foreground">密码至少 8 个字符。</p>
                </div>
              )}
              {restorePreview && (
                <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
                  <InfoRow label="导出时间" value={restorePreview.stats.exportedAt} />
                  <InfoRow label="项目" value={`${restorePreview.stats.projects} 个`} />
                  <InfoRow label="智库条目" value={`${restorePreview.stats.entries} 条`} />
                  <InfoRow label="附件索引" value={`${restorePreview.stats.attachments} 条`} />
                  {(restorePreview.payload.omittedManagedAssets?.length ?? 0) > 0 && <InfoRow label="未内嵌大文件" value={`${restorePreview.payload.omittedManagedAssets?.length} 个（需保留原物理目录）`} />}
                </div>
              )}
            </div>
          )}
          {activeAction?.kind === 'auto' && (
            <div className="grid gap-3">
              <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
                <InfoRow label="当前目录" value={autoBackupDir || '未设置'} />
                <p className="text-muted-foreground">自动备份始终加密，最多保留最近 20 份。</p>
              </div>
              <TextInput label="自动备份密码" type="password" value={backupPassword} onChange={(event) => setBackupPassword(event.target.value)} />
              <TextInput label="确认备份密码" type="password" value={backupPasswordConfirm} onChange={(event) => setBackupPasswordConfirm(event.target.value)} />
            </div>
          )}
          {activeAction?.kind === 'migrate' && (
            <div className="grid gap-4">
              <label className="grid gap-2">
                <Label>目标服务</Label>
                <Select value={migrationDeployment} onValueChange={(value) => {
                  const deployment = value as 'cloud' | 'selfhost'
                  setMigrationDeployment(deployment)
                  if (deployment === 'cloud') setMigrationUrl(officialServiceUrl)
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="selfhost">自部署服务</SelectItem>
                    <SelectItem value="cloud">官方云服务</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <TextInput label="服务地址" value={migrationUrl} onChange={(event) => setMigrationUrl(event.target.value)} placeholder="https://notes.example.com" />
              <TextInput label="登录邮箱" type="email" value={migrationEmail} onChange={(event) => setMigrationEmail(event.target.value)} />
              <TextInput label="登录密码" type="password" value={migrationPassword} onChange={(event) => setMigrationPassword(event.target.value)} />
              <p className="text-sm text-muted-foreground">迁移采用复制方式，不会删除本地资料。仅本机路径引用不会上传。</p>
              {migrationProgress && <p className="text-sm text-muted-foreground">{migrationProgress}</p>}
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">取消</Button></DialogClose>
            <Button disabled={backupActionDisabled || (activeAction?.kind === 'migrate' && (!migrationUrl.trim() || !migrationEmail.trim() || migrationPassword.length < 8))} onClick={() => void runBackupAction()}>{backupActionLabel}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}

function isEncryptedBackupFileContent(content: string) {
  try {
    const parsed = JSON.parse(content) as { format?: string; version?: number; cipher?: string; compression?: string }
    return parsed.format === 'deekbak' && parsed.version === 2 && parsed.cipher === 'aes-256-gcm' && parsed.compression === 'gzip'
  } catch {
    return false
  }
}

export function SettingsPage() {
  const repositories = useRepositories()
  const source = useRepositorySource()
  const runtimeConfig = useRuntimeConfig()
  const queryClient = useQueryClient()
  const [settingsMessage, setSettingsMessage] = useState('')
  const [confirmResetOpen, setConfirmResetOpen] = useState(false)
  const [masterPasswordOpen, setMasterPasswordOpen] = useState(false)
  const [masterPassword, setMasterPassword] = useState('')
  const [masterPasswordConfirm, setMasterPasswordConfirm] = useState('')
  const [rememberMasterPassword, setRememberMasterPassword] = useState(true)
  const [serviceCurrentPassword, setServiceCurrentPassword] = useState('')
  const [serviceNewPassword, setServiceNewPassword] = useState('')
  const [serviceNewPasswordConfirm, setServiceNewPasswordConfirm] = useState('')
  const [servicePasswordMessage, setServicePasswordMessage] = useState('')
  const [servicePasswordSaving, setServicePasswordSaving] = useState(false)
  const isLocal = source.kind === 'local'
  const configuredAutoBackupDir = window.localStorage.getItem(autoBackupDirectoryStorageKey) ?? ''
  const configuredAutoBackupError = window.localStorage.getItem(autoBackupErrorStorageKey) ?? ''

  const { data: runtimeInfo = null } = useQuery({
    queryKey: ['runtime-info'],
    queryFn: async () => (await window.deek?.getRuntimeInfo?.()) ?? null,
  })
  const { data: securityStatus = null } = useQuery({
    queryKey: ['local-security-status'],
    queryFn: async () => (await window.deek?.getLocalSecurityStatus?.())?.data ?? null,
  })

  const resetLocalStore = async () => {
    if (window.deek?.clearLocalStore) {
      const result = await window.deek.clearLocalStore()
      if (!result.ok) {
        setSettingsMessage(result.error ?? '重置本地库失败')
        return
      }
    }
    window.localStorage.removeItem(localBackupStorageKey)
    window.localStorage.removeItem(autoBackupDirectoryStorageKey)
    window.localStorage.removeItem(autoBackupErrorStorageKey)
    window.localStorage.removeItem(autoBackupPasswordStorageKey)
    await repositories.backup.importBackup(await repositories.backup.exportBackup())
    await queryClient.invalidateQueries()
    setConfirmResetOpen(false)
    setSettingsMessage('已清空本地持久化文件。重启应用后会重新初始化示例数据。')
  }

  const saveMasterPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (masterPassword !== masterPasswordConfirm) {
      setSettingsMessage('两次输入的主密码不一致')
      return
    }
    const result = await window.deek?.setLocalMasterPassword?.({ password: masterPassword, remember: rememberMasterPassword })
    if (!result?.ok) {
      setSettingsMessage(result?.error ?? '设置主密码失败')
      return
    }
    setMasterPassword('')
    setMasterPasswordConfirm('')
    setMasterPasswordOpen(false)
    await queryClient.invalidateQueries({ queryKey: ['local-security-status'] })
    setSettingsMessage('本地主密码已启用')
  }

  const lockLocalDatabase = async () => {
    const result = await window.deek?.lockLocalDatabase?.({ forgetRemembered: true })
    if (!result?.ok) {
      setSettingsMessage(result?.error ?? '锁定本地库失败')
      return
    }
    await queryClient.invalidateQueries()
    setSettingsMessage('本地库已锁定，并已取消记住本机解锁')
  }

  const disableMasterPassword = async () => {
    const result = await window.deek?.disableLocalMasterPassword?.()
    if (!result?.ok) {
      setSettingsMessage(result?.error ?? '关闭主密码失败')
      return
    }
    await queryClient.invalidateQueries({ queryKey: ['local-security-status'] })
    setSettingsMessage('已关闭主密码，本地库仍保持 SQLCipher 整库加密')
  }

  const saveServicePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (runtimeConfig.config.kind !== 'server') return
    if (serviceNewPassword !== serviceNewPasswordConfirm) {
      setServicePasswordMessage('两次输入的新密码不一致')
      return
    }
    setServicePasswordSaving(true)
    setServicePasswordMessage('')
    try {
      await changeServicePassword(runtimeConfig.config.baseUrl, runtimeConfig.config.accessToken, serviceCurrentPassword, serviceNewPassword)
      setServiceCurrentPassword('')
      setServiceNewPassword('')
      setServiceNewPasswordConfirm('')
      setServicePasswordMessage('密码已修改')
    } catch (error) {
      setServicePasswordMessage(error instanceof Error ? error.message : '密码修改失败')
    } finally {
      setServicePasswordSaving(false)
    }
  }

  if (!isLocal && runtimeConfig.config.kind === 'server') {
    return (
      <main className="h-full overflow-auto p-6">
        <PageHeader title="设置" description="查看当前服务连接。切换到本地库只会退出当前会话视图，不会删除已保存的服务连接。" />
        <section className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold">服务端连接</h2>
                <p className="mt-1 text-sm text-muted-foreground">当前工作空间的数据由所连接的 Deek PM 服务持久化。</p>
              </div>
              <Badge>{source.label}</Badge>
            </div>
            <div className="mt-5 grid gap-3 text-sm">
              <InfoRow label="服务地址" value={runtimeConfig.config.baseUrl} />
              <InfoRow label="登录账号" value={runtimeConfig.config.accountEmail} />
              <InfoRow label="连接类型" value={runtimeConfig.config.deployment === 'cloud' ? '官方云服务' : '自部署服务'} />
              <InfoRow label="接口方式" value="Deek PM HTTP API v1" />
            </div>
            <Button
              variant="outline"
              className="mt-5"
              onClick={() => {
                runtimeConfig.useLocalMode()
                queryClient.clear()
                void runtimeConfig.refreshSavedServices()
                window.location.hash = '#/'
              }}
            >
              <HardDrive size={15} />
              切换到本地库（保留服务连接）
            </Button>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              只退出当前服务会话视图，不会删除启动页上的已保存连接。需要彻底移除时，请在启动页删除对应连接卡片。
            </p>
          </Card>
          <Card className="p-5">
            <h2 className="text-sm font-semibold">数据边界</h2>
            <div className="mt-4 grid gap-3 text-sm">
              <InfoRow label="业务数据" value="保存于服务端 PostgreSQL" />
              <InfoRow label="敏感条目" value="服务端 AES-256-GCM 加密" />
              <InfoRow label="本地库" value="保留在本机，不会自动上传" />
              <InfoRow label="已保存连接" value="保存在本机加密库，切模式不删除" />
              <InfoRow label="备份" value="由服务端部署方统一负责" />
            </div>
          </Card>
          <Card className="p-5 lg:col-span-2">
            <form onSubmit={saveServicePassword}>
              <h2 className="text-sm font-semibold">登录密码</h2>
              <p className="mt-1 text-sm text-muted-foreground">修改当前个人服务账号的登录密码。</p>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <TextInput label="当前密码" type="password" value={serviceCurrentPassword} onChange={(event) => setServiceCurrentPassword(event.target.value)} />
                <TextInput label="新密码" type="password" value={serviceNewPassword} onChange={(event) => setServiceNewPassword(event.target.value)} />
                <TextInput label="确认新密码" type="password" value={serviceNewPasswordConfirm} onChange={(event) => setServiceNewPasswordConfirm(event.target.value)} />
              </div>
              {servicePasswordMessage && <p className="mt-3 text-sm text-muted-foreground">{servicePasswordMessage}</p>}
              <Button className="mt-4" type="submit" disabled={servicePasswordSaving || serviceCurrentPassword.length < 8 || serviceNewPassword.length < 10 || serviceNewPassword !== serviceNewPasswordConfirm}>
                <ShieldCheck size={15} />
                {servicePasswordSaving ? '保存中…' : '修改密码'}
              </Button>
            </form>
          </Card>
          {runtimeConfig.config.deployment === 'selfhost' && (
            <ServiceStorageSettingsCard baseUrl={runtimeConfig.config.baseUrl} accessToken={runtimeConfig.config.accessToken} />
          )}
        </section>
      </main>
    )
  }

  return (
    <main className="h-full overflow-auto p-6">
      <PageHeader title="设置" description="查看本地运行环境、数据目录和当前存储模式。" />
      {settingsMessage && <div className="mt-5 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">{settingsMessage}</div>}
      <section className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold">本地数据管理</h2>
              <p className="mt-1 text-sm text-muted-foreground">查看应用数据目录，或清空本机保存的 Deek PM 本地库。</p>
            </div>
            <Badge variant={isLocal ? 'default' : 'outline'}>{source.label}</Badge>
          </div>
          <div className="mt-5 grid gap-3 text-sm">
            <InfoRow label="数据源" value={source.description} />
            <InfoRow label="存储位置" value={runtimeInfo?.localDatabasePath ?? runtimeInfo?.userDataPath ?? '浏览器本地存储'} />
            <InfoRow label="系统加密" value={runtimeInfo?.safeStorageAvailable ? '可用' : '不可用'} />
            <InfoRow label="自动备份" value={configuredAutoBackupDir || '未开启'} />
            {configuredAutoBackupError && <InfoRow label="备份错误" value={configuredAutoBackupError} />}
          </div>
          <div className="mt-5 flex gap-2">
            <Button
              variant="outline"
              disabled={!window.deek?.openUserDataDir}
              onClick={async () => {
                const result = await window.deek?.openUserDataDir?.()
                setSettingsMessage(result?.ok ? '已打开本地数据目录' : result?.error ?? '打开数据目录失败')
              }}
            >
              <Folder size={15} />
              打开数据目录
            </Button>
            <Button variant="destructive" onClick={() => setConfirmResetOpen(true)}>
              <RotateCcw size={15} />
              重置本地库
            </Button>
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="text-sm font-semibold">本地模式状态</h2>
          <div className="mt-4 grid gap-3 text-sm">
            <InfoRow label="本地数据库" value="SQLCipher 已接入" />
            <InfoRow label="密钥保护" value={runtimeInfo?.safeStorageAvailable ? 'safeStorage 已启用' : '使用本机降级密钥文件'} />
            <InfoRow label="附件索引" value="保存本地路径引用" />
            <InfoRow label="备份恢复" value="支持 .deekbak" />
          </div>
        </Card>
        <LocalStorageSettingsCard />
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold">本地主密码</h2>
              <p className="mt-1 text-sm text-muted-foreground">主密码用于包裹本地数据库密钥，可选择是否记住本机解锁。</p>
            </div>
            <Badge variant={securityStatus?.configured ? 'default' : 'outline'}>{securityStatus?.configured ? '已启用' : '未启用'}</Badge>
          </div>
          <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
            <InfoRow label="锁定状态" value={securityStatus?.locked ? '已锁定' : '已解锁'} />
            <InfoRow label="记住本机" value={securityStatus?.remembered ? '已开启' : '未开启'} />
            <InfoRow label="安全存储" value={securityStatus?.safeStorageAvailable ? '可用' : '不可用'} />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setMasterPassword('')
                setMasterPasswordConfirm('')
                setMasterPasswordOpen(true)
              }}
            >
              <ShieldCheck size={15} />
              {securityStatus?.configured ? '修改主密码' : '设置主密码'}
            </Button>
            <Button variant="outline" disabled={!securityStatus?.configured} onClick={() => void lockLocalDatabase()}>
              <RotateCcw size={15} />
              锁定并取消记住
            </Button>
            <Button variant="ghost" disabled={!securityStatus?.configured} onClick={() => void disableMasterPassword()}>
              关闭主密码
            </Button>
          </div>
        </Card>
      </section>
      <Dialog open={masterPasswordOpen} onOpenChange={setMasterPasswordOpen}>
        <DialogContent>
          <form onSubmit={saveMasterPassword}>
            <DialogHeader>
              <DialogTitle>{securityStatus?.configured ? '修改主密码' : '设置主密码'}</DialogTitle>
              <DialogDescription>主密码至少 8 个字符。启用后，本地库锁定时需要输入主密码才能访问。</DialogDescription>
            </DialogHeader>
            <div className="mt-5 grid gap-4">
              <TextInput label="主密码" type="password" value={masterPassword} onChange={(event) => setMasterPassword(event.target.value)} />
              <TextInput label="确认主密码" type="password" value={masterPasswordConfirm} onChange={(event) => setMasterPasswordConfirm(event.target.value)} />
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={rememberMasterPassword} onChange={(event) => setRememberMasterPassword(event.target.checked)} />
                记住本机解锁
              </label>
            </div>
            <DialogFooter className="mt-6">
              <DialogClose asChild><Button type="button" variant="outline">取消</Button></DialogClose>
              <Button type="submit" disabled={masterPassword.length < 8 || masterPassword !== masterPasswordConfirm}>保存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmResetOpen} onOpenChange={setConfirmResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重置本地库？</DialogTitle>
            <DialogDescription>这会清空当前设备上的本地持久化数据。建议先导出备份。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">取消</Button></DialogClose>
            <Button variant="destructive" onClick={() => void resetLocalStore()}>确认重置</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}

function LaunchMetric({ icon: Icon, label, value, helper }: { icon: LucideIcon; label: string; value: string; helper: string }) {
  return (
    <div className="rounded-[var(--radius-panel)] border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3 shadow-[var(--glass-highlight)] backdrop-blur-[var(--glass-blur)]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon size={15} className="text-muted-foreground" />
      </div>
      <strong className="mt-2 block truncate text-lg font-semibold">{value}</strong>
      <span className="mt-1 block truncate text-xs text-muted-foreground">{helper}</span>
    </div>
  )
}

function LaunchStep({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="grid grid-cols-[36px_minmax(0,1fr)] gap-3 rounded-[var(--radius-panel)] border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3 shadow-[var(--glass-highlight)] backdrop-blur-[var(--glass-blur)]">
      <span className="grid h-9 w-9 place-items-center rounded-[var(--radius-control)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] text-muted-foreground">
        <Icon size={16} />
      </span>
      <span className="min-w-0">
        <strong className="block text-sm">{title}</strong>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{text}</span>
      </span>
    </div>
  )
}

function WorkspaceSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-3">
        <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
        {description ? <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground/90">{description}</p> : null}
      </div>
      {children}
    </section>
  )
}

function WorkspaceGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{children}</div>
}

function WorkspaceCard({ workspace, featured = false }: { workspace: Workspace; featured?: boolean }) {
  const Icon = workspace.type === 'local' ? HardDrive : workspace.deployment === 'cloud' ? Cloud : Server
  const to = '/workspace/$workspaceId'
  const action = '进入'
  return (
    <Link
      to={to}
      params={{ workspaceId: workspace.id }}
      className={cn(
        'deek-glass flex min-h-28 items-center gap-4 rounded-[var(--radius-dialog)] border p-4 transition hover:-translate-y-0.5 hover:border-[var(--border-strong)]',
        featured ? 'max-w-none p-5' : 'max-w-xl',
      )}
    >
      <span className={cn('grid shrink-0 place-items-center rounded-lg text-white', featured ? 'h-14 w-14' : 'h-12 w-12', iconTone(workspace))}>
        <Icon size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <strong className={cn('block truncate', featured && 'text-lg')}>{workspace.name}</strong>
        <span className={cn('mt-1 block text-sm text-muted-foreground', featured ? 'line-clamp-2' : 'truncate')}>{workspace.description}</span>
      </span>
      <Badge variant="outline">{deploymentLabel(workspace)}</Badge>
      <span className="inline-flex items-center gap-1 text-sm font-medium">
        {action}
        <ChevronRight size={15} />
      </span>
    </Link>
  )
}

function SavedServiceCard({
  connection,
  current,
  onOpen,
  onDelete,
}: {
  connection: SavedServiceConnection
  current: boolean
  onOpen: () => void
  onDelete: () => void
}) {
  const Icon = connection.deployment === 'cloud' ? Cloud : Server
  return (
    <div className={cn('deek-glass flex min-h-28 items-center gap-4 rounded-[var(--radius-dialog)] border p-4', current && 'border-[var(--border-strong)] ring-1 ring-[var(--border-strong)]/30')}>
      <button type="button" className="flex min-w-0 flex-1 items-center gap-4 text-left" onClick={onOpen}>
        <span className={cn('grid h-12 w-12 shrink-0 place-items-center rounded-lg text-white', connection.deployment === 'cloud' ? 'bg-sky-500' : 'bg-violet-500')}>
          <Icon size={22} />
        </span>
        <span className="min-w-0 flex-1">
          <strong className="block truncate">{connection.instanceName}</strong>
          <span className="mt-1 block truncate text-sm text-muted-foreground">{connection.accountEmail}</span>
          <span className="mt-1 block truncate text-xs text-muted-foreground">{connection.baseUrl}</span>
          {!current && (
            <span className="mt-1 block text-xs text-muted-foreground">
              {connection.hasSavedSession ? '点击恢复此服务会话' : '会话已失效，点击后重新登录'}
            </span>
          )}
        </span>
      </button>
      <div className="grid shrink-0 justify-items-end gap-2">
        <Badge variant={current ? 'default' : 'outline'}>{current ? '当前连接' : connection.hasSavedSession ? '可直接进入' : '需重新登录'}</Badge>
        <Button type="button" size="icon" variant="ghost" aria-label="删除已保存连接" onClick={onDelete}><Trash2 size={15} /></Button>
      </div>
    </div>
  )
}

function TopBar({ workspace }: { workspace: Workspace }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const navigate = useNavigate()
  const allTabs = useWorkspaceTabs((state) => state.tabs)
  const tabs = useMemo(() => allTabs.filter((tab) => tab.workspaceId === workspace.id), [allTabs, workspace.id])
  const closeProjectTab = useWorkspaceTabs((state) => state.closeProjectTab)
  const activeProjectId = getCurrentProjectId(pathname)
  const handleCloseProjectTab = (projectId: string) => {
    const nextTabs = tabs.filter((tab) => tab.projectId !== projectId)
    closeProjectTab(workspace.id, projectId)
    if (activeProjectId !== projectId) return

    const nextTab = nextTabs.at(-1)
    if (nextTab) {
      void navigate({ to: '/workspace/$workspaceId/project/$projectId', params: { workspaceId: workspace.id, projectId: nextTab.projectId } })
      return
    }

    void navigate({ to: '/workspace/$workspaceId', params: { workspaceId: workspace.id } })
  }
  return (
    <div className="flex h-full min-w-0 items-center gap-3 px-4">
      <Link to="/" className="deek-nav-item grid h-8 w-8 place-items-center rounded-[var(--radius-control)]" aria-label="返回工作空间">
        <ArrowLeft size={16} />
      </Link>
      <div className="flex min-w-0 items-center gap-2">
        <Badge variant="outline">{workspaceLabel(workspace)}</Badge>
        <strong className="truncate text-sm">{workspace.name}</strong>
      </div>
      <div className="ml-2 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        <TopBarLink workspaceId={workspace.id} active={!activeProjectId && pathname.endsWith(`/workspace/${workspace.id}`)}>
          项目
        </TopBarLink>
        {tabs.map((tab) => (
          <Link
            key={tab.projectId}
            to="/workspace/$workspaceId/project/$projectId"
            params={{ workspaceId: workspace.id, projectId: tab.projectId }}
            className={cn(
              'deek-nav-item inline-flex h-8 max-w-52 shrink-0 items-center gap-2 rounded-[var(--radius-control)] px-3 text-sm',
              activeProjectId === tab.projectId && 'deek-nav-item-active',
            )}
          >
            <span className="truncate">{tab.title}</span>
            <button
              type="button"
              className="rounded p-0.5 hover:bg-[var(--nav-item-hover-bg)]"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                handleCloseProjectTab(tab.projectId)
              }}
              aria-label="关闭项目标签"
            >
              <X size={13} />
            </button>
          </Link>
        ))}
      </div>
    </div>
  )
}

function TopBarLink({ workspaceId, active, children }: { workspaceId: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      to="/workspace/$workspaceId"
      params={{ workspaceId }}
      className={cn('deek-nav-item inline-flex h-8 shrink-0 items-center rounded-[var(--radius-control)] px-3 text-sm', active && 'deek-nav-item-active')}
    >
      {children}
    </Link>
  )
}

function Sidebar({ workspace }: { workspace: Workspace }) {
  return (
    <nav className="flex h-full flex-col gap-1 p-3">
      <SideLink workspaceId={workspace.id} to="/workspace/$workspaceId" icon={Folder} label="项目" />
      <SideLink workspaceId={workspace.id} to="/workspace/$workspaceId/stats" icon={BarChart3} label="项目统计信息" />
      <SideLink workspaceId={workspace.id} to="/workspace/$workspaceId/quick-entries" icon={Pin} label="快捷入口管理" />
      {workspace.type === 'local' && <SideLink workspaceId={workspace.id} to="/workspace/$workspaceId/backup" icon={ShieldCheck} label="备份" />}
      <SideLink workspaceId={workspace.id} to="/workspace/$workspaceId/settings" icon={Settings} label="设置" />
    </nav>
  )
}

function SideLink(props: {
  workspaceId: string
  to: '/workspace/$workspaceId' | '/workspace/$workspaceId/stats' | '/workspace/$workspaceId/quick-entries' | '/workspace/$workspaceId/backup' | '/workspace/$workspaceId/settings'
  icon: LucideIcon
  label: string
}) {
  const Icon = props.icon
  return (
    <Link
      to={props.to}
      params={{ workspaceId: props.workspaceId }}
      activeProps={{ className: 'deek-nav-item-active' }}
      className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }), 'deek-nav-item justify-start px-3 shadow-none')}
    >
      <Icon size={18} />
      {props.label}
    </Link>
  )
}

function QuickEntryShelf({ workspaceId, entries, className }: { workspaceId: string; entries: QuickEntry[]; className?: string }) {
  return (
    <section className={cn('deek-glass rounded-[var(--radius-panel)] border p-3', className ?? 'mt-5')}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-[var(--radius-control)] border border-[var(--glass-border)] bg-[var(--glass-bg)] text-muted-foreground">
            <Pin size={16} />
          </span>
          <strong className="text-sm">快捷入口</strong>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/workspace/$workspaceId/quick-entries" params={{ workspaceId }}>
            管理
          </Link>
        </Button>
      </div>
      {entries.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {entries.map((entry) => {
            const Icon = quickEntryIcon(entry.targetType)
            return (
              <button
                key={entry.id}
                type="button"
                className="flex min-w-0 items-center gap-3 rounded-md border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2 text-left transition hover:bg-[var(--button-hover-bg)]"
                onClick={() => openQuickEntry(entry)}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[var(--surface-muted)] text-muted-foreground">
                  <Icon size={17} />
                </span>
                <span className="min-w-0">
                  <strong className="block truncate text-sm">{entry.name}</strong>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">{quickEntryTypeLabel[entry.targetType]}</span>
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">
          <span>暂无上架入口</span>
          <Button asChild size="sm" variant="outline">
            <Link to="/workspace/$workspaceId/quick-entries" params={{ workspaceId }}>
              去上架
            </Link>
          </Button>
        </div>
      )}
    </section>
  )
}

function QuickEntryForm({
  value,
  pathPickerMessage,
  onChange,
  onChoosePath,
}: {
  value: QuickEntryFormValues
  pathPickerMessage?: string
  onChange: (value: QuickEntryFormValues) => void
  onChoosePath: (kind: 'file' | 'directory' | 'any') => void | Promise<void>
}) {
  return (
    <div className="mt-5 grid gap-4">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => void onChoosePath('any')}>
          <File size={16} />
          选择文件或快捷方式
        </Button>
        <Button type="button" variant="outline" onClick={() => void onChoosePath('directory')}>
          <FolderOpen size={16} />
          选择文件夹
        </Button>
      </div>
      {pathPickerMessage && <p className="rounded-md border border-dashed bg-[var(--surface-muted)] px-3 py-2 text-xs leading-5 text-muted-foreground">{pathPickerMessage}</p>}
      <TextInput label="入口名称" value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} />
      <TextInput label="目标路径" value={value.target} onChange={(event) => onChange({ ...value, target: event.target.value, targetType: inferQuickEntryTargetType(event.target.value, null) })} />
      <label className="grid gap-2">
        <Label>入口类型</Label>
        <Select value={value.targetType} onValueChange={(targetType) => onChange({ ...value, targetType: targetType as QuickEntryTargetType })}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(quickEntryTypeLabel).map(([targetType, label]) => (
              <SelectItem key={targetType} value={targetType}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input type="checkbox" checked={value.published} onChange={(event) => onChange({ ...value, published: event.target.checked })} />
        上架到项目页
      </label>
    </div>
  )
}

const quickEntryTypeLabel: Record<QuickEntryTargetType, string> = {
  file: '文件',
  directory: '文件夹',
  shortcut: '快捷方式',
  url: '网址',
  other: '其他',
}

function quickEntryIcon(targetType: QuickEntryTargetType) {
  if (targetType === 'directory') return FolderOpen
  if (targetType === 'shortcut') return ExternalLink
  if (targetType === 'url') return Link2
  if (targetType === 'other') return File
  return File
}

function inferQuickEntryTargetType(target: string, stat: DeekPathStatResult | null): QuickEntryTargetType {
  const value = target.trim()
  if (/^https?:\/\//i.test(value)) return 'url'
  if (/\.lnk$/i.test(value)) return 'shortcut'
  if (stat?.kind === 'directory') return 'directory'
  if (stat?.kind === 'file') return 'file'
  return value ? 'other' : 'file'
}

function getDefaultQuickEntryName(target: string) {
  const normalized = target.replaceAll('\\', '/')
  const lastSegment = normalized.split('/').filter(Boolean).at(-1) ?? target
  return lastSegment.replace(/\.lnk$/i, '')
}

function openQuickEntry(entry: QuickEntry) {
  if (window.deek?.openExternal) {
    void window.deek.openExternal(entry.target)
    return
  }
  if (entry.targetType === 'url') window.open(entry.target, '_blank', 'noopener,noreferrer')
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function ProjectStatCard({ icon: Icon, label, value, helper }: { icon: LucideIcon; label: string; value: string; helper: string }) {
  return (
    <div className="deek-glass rounded-[var(--radius-dialog)] border p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="grid h-8 w-8 place-items-center rounded-[var(--radius-control)] border border-[var(--glass-border)] bg-[var(--glass-bg)] text-muted-foreground">
          <Icon size={16} />
        </span>
      </div>
      <strong className="mt-3 block truncate text-2xl font-semibold">{value}</strong>
      <span className="mt-1 block truncate text-xs text-muted-foreground">{helper}</span>
    </div>
  )
}

function ProjectCard({ project, workspaceId, viewMode }: { project: Project; workspaceId: string; viewMode: ProjectViewMode }) {
  const repositories = useRepositories()
  const queryClient = useQueryClient()
  const openProjectTab = useWorkspaceTabs((state) => state.openProjectTab)
  const closeProjectTab = useWorkspaceTabs((state) => state.closeProjectTab)
  const navigate = useNavigate()
  const [detailOpen, setDetailOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editValues, setEditValues] = useState<ProjectFormValues>({
    name: project.name,
    description: project.description,
    tag: project.tag,
    tone: project.tone,
  })
  const tone = projectToneStyle[project.tone]
  const isList = viewMode === 'list'
  const updateProjectMutation = useMutation({
    mutationFn: () =>
      repositories.project.updateProject({
        id: project.id,
        name: editValues.name.trim() || project.name,
        description: editValues.description.trim(),
        tag: editValues.tag.trim() || project.tag,
        tone: editValues.tone,
      }),
    onSuccess: (updatedProject) => {
      setEditOpen(false)
      if (updatedProject) openProjectTab({ workspaceId, projectId: updatedProject.id, title: updatedProject.name })
      void queryClient.invalidateQueries({ queryKey: ['projects', workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ['project', project.id] })
    },
  })
  const deleteProjectMutation = useMutation({
    mutationFn: () => repositories.project.deleteProject(project.id),
    onSuccess: () => {
      setDeleteOpen(false)
      closeProjectTab(workspaceId, project.id)
      void queryClient.invalidateQueries({ queryKey: ['projects', workspaceId] })
      void navigate({ to: '/workspace/$workspaceId', params: { workspaceId } })
    },
  })
  const openProject = () => {
    openProjectTab({ workspaceId, projectId: project.id, title: project.name })
    setDetailOpen(false)
    void navigate({ to: '/workspace/$workspaceId/project/$projectId', params: { workspaceId, projectId: project.id } })
  }

  return (
    <m.article
      layout
      initial={{ opacity: 0, y: 10, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.99 }}
      transition={{ duration: 0.2, ease: standardEase }}
      className={cn(
        'deek-glass group relative overflow-hidden rounded-[var(--radius-dialog)] border transition-all hover:border-[var(--border-strong)] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20',
        isList ? 'grid grid-cols-[minmax(0,1fr)_44px] items-center rounded-[var(--radius-panel)]' : 'hover:-translate-y-0.5',
      )}
    >
      <button
        type="button"
        onClick={openProject}
        className={cn(
          'w-full appearance-none border-0 bg-transparent text-left text-inherit',
          isList ? 'grid min-h-16 grid-cols-[40px_minmax(160px,1fr)_84px_148px] items-center gap-3 px-4 py-3 pr-2' : 'flex min-h-52 flex-col p-5',
        )}
      >
        <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-md ring-1 transition group-hover:scale-105', tone.panel)}>
          <Folder size={18} className={tone.icon} />
        </span>
        <div className={cn('min-w-0 flex-1', !isList && 'mt-4')}>
          <div className={cn('flex min-w-0 items-center gap-2', !isList && 'pr-10')}>
            <strong className={cn('truncate font-semibold', isList ? 'text-sm' : 'text-base')}>{project.name}</strong>
            <span className={cn('size-2 shrink-0 rounded-full', tone.dot)} />
          </div>
          <div className={cn('flex min-w-0 items-center gap-2 text-xs text-muted-foreground', isList ? 'mt-1' : 'mt-2 flex-wrap')}>
            <Badge variant="outline" className="max-w-36 truncate bg-background/80">{project.tag}</Badge>
            {isList && <span className="truncate text-sm text-muted-foreground">{project.description}</span>}
          </div>
        </div>
        {isList && (
          <span className="grid gap-1 text-sm">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <Database size={14} className={tone.icon} />
              {project.entryCount} 条
            </span>
            <span className="text-xs text-muted-foreground">资料</span>
          </span>
        )}
        {isList && (
          <span className="grid justify-items-end gap-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <CalendarClock size={13} />
              {project.updatedAtText}
            </span>
            <span className="inline-flex items-center gap-1 text-foreground">
              进入
              <ChevronRight size={14} />
            </span>
          </span>
        )}
        {!isList && <p className="mt-4 line-clamp-2 min-h-12 text-sm leading-6 text-muted-foreground">{project.description}</p>}
        {!isList && (
          <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-5 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Database size={14} />
              <strong className="font-medium text-foreground">{project.entryCount} 条</strong>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock size={14} />
              <strong className="font-medium text-foreground">{project.updatedAtText}</strong>
            </span>
          </div>
        )}
        {!isList && (
          <footer className="mt-4 flex items-center justify-between border-t pt-3 text-sm">
            <span className="text-xs text-muted-foreground">项目资料空间</span>
            <span className="inline-flex items-center gap-1 font-medium transition group-hover:translate-x-0.5">
              进入项目
              <ChevronRight size={15} />
            </span>
          </footer>
        )}
      </button>
      <div className={cn('absolute right-3 top-4 opacity-80 transition group-hover:opacity-100', isList && 'static grid h-full place-items-center pr-2')}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" aria-label={`${project.name} 更多操作`}>
              <MoreHorizontal size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onSelect={() => setDetailOpen(true)}><Info size={15} />查看详情</DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                setEditValues({ name: project.name, description: project.description, tag: project.tag, tone: project.tone })
                setEditOpen(true)
              }}
            >
              <Pencil size={15} />编辑项目
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void navigator.clipboard?.writeText(project.name)}><Copy size={15} />复制名称</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={openProject}><ExternalLink size={15} />打开项目</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}><Trash2 size={15} />删除项目</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{project.name}</DialogTitle>
            <DialogDescription>{project.description}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
            <InfoRow label="标签" value={project.tag} />
            <InfoRow label="资料数量" value={`${project.entryCount} 条`} />
            <InfoRow label="最近更新" value={project.updatedAtText} />
          </div>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">关闭</Button></DialogClose>
            <Button type="button" onClick={openProject}>打开项目</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              updateProjectMutation.mutate()
            }}
          >
            <DialogHeader>
              <DialogTitle>编辑项目</DialogTitle>
              <DialogDescription>修改项目名称、说明、标签和颜色。</DialogDescription>
            </DialogHeader>
            <ProjectForm value={editValues} workspace={undefined} onChange={setEditValues} />
            <DialogFooter className="mt-6">
              <DialogClose asChild><Button type="button" variant="outline">取消</Button></DialogClose>
              <Button type="submit" disabled={!editValues.name.trim() || updateProjectMutation.isPending}>保存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除项目</DialogTitle>
            <DialogDescription>确定删除“{project.name}”吗？项目内的资料、附件索引和本地备份记录都会一起移除。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">取消</Button></DialogClose>
            <Button variant="destructive" disabled={deleteProjectMutation.isPending} onClick={() => deleteProjectMutation.mutate()}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </m.article>
  )
}

function ProjectForm({ value, workspace, onChange }: { value: ProjectFormValues; workspace?: Workspace; onChange: (value: ProjectFormValues) => void }) {
  return (
    <div className="mt-5 grid gap-4">
      <TextInput label="项目名称" value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} />
      <label className="grid gap-2">
        <Label>项目说明</Label>
        <Textarea value={value.description} onChange={(event) => onChange({ ...value, description: event.target.value })} />
      </label>
      <TextInput label="标签" value={value.tag} onChange={(event) => onChange({ ...value, tag: event.target.value })} placeholder={workspace?.type === 'local' ? '本地项目' : '服务端项目'} />
      <label className="grid gap-2">
        <Label>颜色</Label>
        <Select value={value.tone} onValueChange={(tone) => onChange({ ...value, tone: tone as ProjectTone })}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {toneOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </label>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-3 rounded-md border bg-background px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-foreground">{value}</span>
    </div>
  )
}

function getCurrentProjectId(pathname: string) {
  const match = pathname.match(/\/project\/([^/]+)/)
  return match?.[1]
}

async function normalizeBackupPayload(value: unknown): Promise<BackupPayload> {
  const parsed = value as BackupPayload | { version: 2; data?: BackupPayload }
  if ('data' in parsed && parsed.version === 2 && parsed.data) {
    return decryptSensitiveBackupFields(parsed.data)
  }
  return parsed as BackupPayload
}

function getBackupStats(payload: BackupPayload) {
  return {
    projects: payload.projects.length,
    groups: payload.knowledgeGroups.length,
    entries: Object.keys(payload.entries).length,
    attachments: payload.attachments.length,
    exportedAt: payload.exportedAt,
  }
}

async function decryptSensitiveBackupFields(payload: BackupPayload): Promise<BackupPayload> {
  const next: BackupPayload = JSON.parse(JSON.stringify(payload))
  for (const entry of Object.values(next.entries)) {
    if (!entry.passwordItems) continue
    for (const item of entry.passwordItems) {
      if (!item.valuePreview.startsWith(encryptedFieldPrefix)) continue
      if (!window.deek?.safeDecryptText) throw new Error('This backup contains local encrypted fields that cannot be decrypted on this system')
      const decryptedValue = await window.deek.safeDecryptText(item.valuePreview.slice(encryptedFieldPrefix.length))
      if (!decryptedValue) throw new Error('This backup contains local encrypted fields that cannot be decrypted on this system')
      item.valuePreview = decryptedValue
    }
  }
  return next
}
