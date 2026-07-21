import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowUpDown,
  CheckCircle2,
  ChevronRight,
  Circle,
  Cloud,
  Database,
  Download,
  Eye,
  EyeOff,
  FileText,
  Folder,
  Grid2X2,
  HardDrive,
  KeyRound,
  Link,
  List,
  LockKeyhole,
  Mail,
  MoreHorizontal,
  Plus,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Upload,
  Users,
} from 'lucide-react'
import './App.css'

const workspaceTypes = {
  local: { label: '本地', icon: HardDrive, authText: '免登录', color: 'blue' },
  service: { label: '服务端', icon: Server, authText: '登录进入', color: 'slate' },
}

const workspaces = [
  {
    id: 'local-personal',
    type: 'local',
    deployment: 'local',
    name: '本地个人库',
    desc: '固定在当前电脑上的个人资料库，免登录使用。',
    status: '本机 SQLite / 文件索引',
  },
  {
    id: 'service-insight',
    type: 'service',
    deployment: 'cloud',
    name: 'insight 团队',
    desc: '官方云服务中的研发效能团队空间。',
    status: 'Deek Cloud · 团队所有者',
    serviceUrl: 'https://api.deek.pm',
  },
  {
    id: 'service-suanming',
    type: 'service',
    deployment: 'cloud',
    name: 'suanming 团队',
    desc: '官方云服务中的客户交付团队空间。',
    status: 'Deek Cloud · 成员',
    serviceUrl: 'https://api.deek.pm',
  },
  {
    id: 'service-company',
    type: 'service',
    deployment: 'selfhost',
    name: '公司 A 内网库',
    desc: '企业自部署服务中的项目资料空间。',
    status: 'https://pm.company.local',
    serviceUrl: 'https://pm.company.local',
  },
  {
    id: 'service-client',
    type: 'service',
    deployment: 'selfhost',
    name: '客户 B 部署',
    desc: '客户环境中的自部署服务实例。',
    status: 'https://pm.client-b.local',
    serviceUrl: 'https://pm.client-b.local',
  },
]

const projects = [
  {
    id: 'local-admin',
    workspaceId: 'local-personal',
    title: '本机管理系统资料',
    desc: '个人电脑上的项目说明、账号密码、本地文件和快捷入口',
    tag: '本地项目',
    count: 18,
    updated: '今天 09:40',
    tone: 'blue',
  },
  {
    id: 'local-notes',
    workspaceId: 'local-personal',
    title: '个人资料库',
    desc: '常用脚本、工具链接、临时账号和交接备注',
    tag: '个人库',
    count: 9,
    updated: '昨天 21:16',
    tone: 'green',
  },
  {
    id: 'young-admin',
    workspaceId: 'service-insight',
    title: '若依管理系统',
    desc: '后台项目的说明文档、账号密码、本地文件和线上入口',
    tag: 'Web 项目',
    count: 24,
    updated: '今天 10:18',
    tone: 'violet',
  },
  {
    id: 'project-2',
    workspaceId: 'service-insight',
    title: '项目2',
    desc: '项目二的智库、链接与交接资料',
    tag: '内部项目',
    count: 12,
    updated: '昨天 18:42',
    tone: 'blue',
  },
  {
    id: 'fortune-api',
    workspaceId: 'service-suanming',
    title: '算命服务',
    desc: '客户环境、部署备注和联调入口',
    tag: '交付项目',
    count: 31,
    updated: '周二 14:05',
    tone: 'green',
  },
  {
    id: 'erp-private',
    workspaceId: 'service-company',
    title: '企业 ERP 私有库',
    desc: '企业内网部署后的项目资料、权限、账号和审计记录',
    tag: '自部署',
    count: 37,
    updated: '今天 08:52',
    tone: 'slate',
  },
  {
    id: 'client-handover',
    workspaceId: 'service-client',
    title: '客户 B 交付资料',
    desc: '客户现场部署资料、登录入口、联调账号与交接记录',
    tag: '自部署',
    count: 22,
    updated: '昨天 16:20',
    tone: 'violet',
  },
]

const knowledgeTree = [
  {
    id: 'basic',
    name: '项目基础资料',
    children: [
      { id: 'overview', name: '项目说明', type: 'text' },
      { id: 'local-docs', name: '本地设计稿与文档', type: 'link' },
    ],
  },
  {
    id: 'env',
    name: '环境与账号',
    children: [
      { id: 'dev-accounts', name: '开发环境账号', type: 'password' },
      { id: 'prod-links', name: '生产环境入口', type: 'link' },
    ],
  },
  {
    id: 'handover',
    name: '交接与备注',
    children: [{ id: 'handover-note', name: '上线交接记录', type: 'text' }],
  },
]

const entries = {
  overview: {
    title: '项目说明',
    type: 'text',
    createdAt: '2026-05-28 10:03',
    remark: '用于记录项目背景、关键联系人、部署约定等基础信息。',
    body:
      '这是一个富文本型条目的示意区域。可以记录项目介绍、需求边界、注意事项，也可以粘贴本地文件路径，例如 D:\\projects\\deek-pm\\docs\\需求说明.docx。',
  },
  'local-docs': {
    title: '本地设计稿与文档',
    type: 'link',
    createdAt: '2026-05-28 10:06',
    remark: '常用资料集中挂载，桌面端后续可直接调用系统打开。',
    links: [
      { name: '产品原型 Axure 文件', path: 'D:\\work\\prototype\\deek-pm.rp' },
      { name: 'UI 设计稿目录', path: 'D:\\work\\design\\deek-pm' },
      { name: '接口说明文档', path: 'D:\\work\\docs\\接口说明.md' },
    ],
  },
  'dev-accounts': {
    title: '开发环境账号',
    type: 'password',
    createdAt: '2026-05-28 10:11',
    remark: '密码型条目支持逐条添加名称和内容，并可局部显示或隐藏。',
    secrets: [
      { name: '测试库账号', value: 'postgres / deek_dev_2026' },
      { name: '对象存储 AccessKey', value: 'AKIA-LOCAL-DEMO-2026' },
      { name: '三方服务 Token', value: 'token_demo_project_secret' },
    ],
  },
  'prod-links': {
    title: '生产环境入口',
    type: 'link',
    createdAt: '2026-05-28 10:14',
    remark: '可挂线上地址，也可挂本地快捷方式。',
    links: [
      { name: '生产控制台', path: 'https://console.example.com/project/deek-pm' },
      { name: '监控面板', path: 'https://grafana.example.com/d/deek-pm' },
    ],
  },
  'handover-note': {
    title: '上线交接记录',
    type: 'text',
    createdAt: '2026-05-28 10:19',
    remark: '记录关键变更和待办提醒。',
    body: '上线前确认：数据库迁移、桌面端自动更新通道、本地缓存目录权限、线上/本地数据源切换策略。',
  },
}

const entryTypeMeta = {
  text: { label: '文本型', icon: FileText },
  password: { label: '密码型', icon: LockKeyhole },
  link: { label: '链接型', icon: Link },
}

const navItems = [
  { id: 'projects', label: '项目', icon: Folder },
  { id: 'backup', label: '备份与恢复', icon: ShieldCheck, localOnly: true },
  { id: 'members', label: '成员与邀请', icon: Users, serviceOnly: true },
  { id: 'settings', label: '空间设置', icon: Settings },
]

function App() {
  const [stage, setStage] = useState('launch')
  const [pendingWorkspaceId, setPendingWorkspaceId] = useState('service-insight')
  const [workspaceId, setWorkspaceId] = useState('local-personal')
  const [screen, setScreen] = useState('projects')
  const [selectedProjectId, setSelectedProjectId] = useState('local-admin')
  const [selectedEntryId, setSelectedEntryId] = useState('overview')
  const [visibleSecrets, setVisibleSecrets] = useState({ 0: false, 1: true, 2: false })

  const workspace = workspaces.find((item) => item.id === workspaceId) ?? workspaces[0]
  const workspaceType = workspaceTypes[workspace.type]
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? projects[0]
  const workspaceProjects = useMemo(
    () => projects.filter((project) => project.workspaceId === workspace.id),
    [workspace.id],
  )
  const selectedEntry = entries[selectedEntryId] ?? entries.overview

  function requestEnterWorkspace(nextWorkspaceId) {
    const nextWorkspace = workspaces.find((item) => item.id === nextWorkspaceId)
    if (!nextWorkspace) return
    if (nextWorkspace.type === 'local') {
      enterWorkspace(nextWorkspace.id)
      return
    }
    setPendingWorkspaceId(nextWorkspace.id)
    setStage('auth')
  }

  function enterWorkspace(nextWorkspaceId) {
    const firstProject = projects.find((project) => project.workspaceId === nextWorkspaceId)
    setWorkspaceId(nextWorkspaceId)
    setSelectedProjectId(firstProject?.id ?? selectedProjectId)
    setSelectedEntryId('overview')
    setScreen('projects')
    setStage('app')
  }

  function openProject(projectId) {
    const project = projects.find((item) => item.id === projectId)
    if (!project) return
    setWorkspaceId(project.workspaceId)
    setSelectedProjectId(project.id)
    setSelectedEntryId('overview')
    setScreen('knowledge')
    setStage('app')
  }

  if (stage === 'launch') {
    return <LaunchScreen onEnterWorkspace={requestEnterWorkspace} />
  }

  if (stage === 'auth') {
    const pendingWorkspace = workspaces.find((item) => item.id === pendingWorkspaceId) ?? workspaces[1]
    return (
      <AuthScreen
        workspace={pendingWorkspace}
        onBack={() => setStage('launch')}
        onComplete={() => enterWorkspace(pendingWorkspace.id)}
      />
    )
  }

  return (
    <div className="app-shell">
      <TopBar
        workspace={workspace}
        workspaceType={workspaceType}
        screen={screen}
        project={selectedProject}
        onOpenProject={openProject}
        onHome={() => setScreen('projects')}
        onSwitchWorkspace={() => setStage('launch')}
      />

      <div className="main-layout">
        <WorkspaceSidebar
          workspace={workspace}
          workspaceType={workspaceType}
          activeScreen={screen}
          onNavigate={setScreen}
          onSwitchWorkspace={() => setStage('launch')}
        />

        {screen === 'projects' && (
          <ProjectList
            workspace={workspace}
            workspaceType={workspaceType}
            projects={workspaceProjects}
            onOpenProject={openProject}
          />
        )}
        {screen === 'backup' && <BackupPanel />}
        {screen === 'members' && <MembersPanel workspace={workspace} />}
        {screen === 'settings' && <SettingsPanel workspace={workspace} />}
        {screen === 'knowledge' && (
          <KnowledgeWorkspace
            workspace={workspace}
            workspaceType={workspaceType}
            project={selectedProject}
            selectedEntry={selectedEntry}
            selectedEntryId={selectedEntryId}
            setSelectedEntryId={setSelectedEntryId}
            visibleSecrets={visibleSecrets}
            setVisibleSecrets={setVisibleSecrets}
          />
        )}
      </div>
    </div>
  )
}

function LaunchScreen({ onEnterWorkspace }) {
  const localWorkspace = workspaces.find((item) => item.type === 'local')
  const cloudServiceWorkspaces = workspaces.filter((item) => item.type === 'service' && item.deployment === 'cloud')
  const selfhostServiceWorkspaces = workspaces.filter(
    (item) => item.type === 'service' && item.deployment === 'selfhost',
  )

  return (
    <main className="launch-screen">
      <section className="launch-hero">
        <div className="brand-large">
          <span>D</span>
          <strong>Deek PM</strong>
        </div>
        <h1>选择工作空间</h1>
        <p>
          本地个人库固定一个；服务端空间可以有多个实例。官方云和自部署使用同一套服务端接口，只是服务地址与认证来源不同。
        </p>
      </section>

      <section className="workspace-section">
        <SectionHeader title="本地" desc="免登录，适合个人资料和本机项目。" />
        <WorkspaceCard workspace={localWorkspace} onEnter={onEnterWorkspace} />
      </section>

      <section className="workspace-section">
        <SectionHeader title="官方云服务" desc="连接 Deek PM 官方服务端。" />
        <div className="workspace-grid">
          {cloudServiceWorkspaces.map((workspace) => (
            <WorkspaceCard key={workspace.id} workspace={workspace} onEnter={onEnterWorkspace} />
          ))}
        </div>
      </section>

      <section className="workspace-section">
        <SectionHeader title="自部署服务" desc="连接企业或客户自己的服务端。" />
        <div className="workspace-grid">
          {selfhostServiceWorkspaces.map((workspace) => (
            <WorkspaceCard key={workspace.id} workspace={workspace} onEnter={onEnterWorkspace} />
          ))}
          <button className="add-workspace-card">
            <Plus size={22} />
            添加服务端空间
          </button>
        </div>
      </section>
    </main>
  )
}

function SectionHeader({ title, desc }) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      <p>{desc}</p>
    </div>
  )
}

function WorkspaceCard({ workspace, onEnter }) {
  const type = workspaceTypes[workspace.type]
  const Icon = type.icon
  const actionText = workspace.type === 'local' ? type.authText : `${deploymentLabel(workspace)} · ${type.authText}`

  return (
    <button className="workspace-card" onClick={() => onEnter(workspace.id)}>
      <span className={`workspace-icon ${type.color}`}>
        <Icon size={23} />
      </span>
      <div>
        <strong>{workspace.name}</strong>
        <p>{workspace.desc}</p>
        <em>{workspace.status}</em>
      </div>
      <span className="workspace-enter">
        {actionText}
        <ChevronRight size={16} />
      </span>
    </button>
  )
}

function AuthScreen({ workspace, onBack, onComplete }) {
  const type = workspaceTypes[workspace.type]
  const isSelfhost = workspace.deployment === 'selfhost'

  return (
    <main className="auth-screen">
      <section className="auth-panel">
        <button className="back-button" onClick={onBack}>
          <ArrowLeft size={16} />
          返回工作空间
        </button>
        <div className={`auth-icon ${type.color}`}>{isSelfhost ? <Server size={30} /> : <Cloud size={30} />}</div>
        <h1>{workspace.name}</h1>
        <p>{isSelfhost ? '连接自部署服务，并使用该服务端账号进入。' : '登录官方云服务后进入该团队空间。'}</p>

        <label className="auth-field">
          <span>服务地址</span>
          <input defaultValue={workspace.serviceUrl} />
        </label>
        <label className="auth-field">
          <span>{isSelfhost ? '服务端账号' : '账号'}</span>
          <input defaultValue={isSelfhost ? 'admin@company.local' : 'deek@example.com'} />
        </label>
        <label className="auth-field">
          <span>密码</span>
          <input type="password" defaultValue="prototype" />
        </label>

        <button className="primary-action auth-submit" onClick={onComplete}>
          <CheckCircle2 size={17} />
          进入工作空间
        </button>
      </section>
    </main>
  )
}

function TopBar({ workspace, workspaceType, screen, project, onOpenProject, onHome, onSwitchWorkspace }) {
  const tabProjects = ['local-admin', 'young-admin', 'erp-private']
    .map((id) => projects.find((item) => item.id === id))
    .filter(Boolean)

  return (
    <header className="topbar">
      <button className="brand-button" onClick={onHome}>
        <span className="brand-mark">D</span>
        <span className="brand-text">Deek PM</span>
      </button>

      <nav className="workspace-tabbar" aria-label="工作区标签">
        <button className={screen === 'projects' ? 'workspace-tab active' : 'workspace-tab'} onClick={onHome}>
          <Circle size={7} fill="currentColor" />
          <span>{workspace.name}</span>
        </button>
        {tabProjects.map((tabProject) => {
          const tabWorkspace = workspaces.find((item) => item.id === tabProject.workspaceId)
          const active = screen === 'knowledge' && project.id === tabProject.id
          return (
            <button
              key={tabProject.id}
              className={active ? 'workspace-tab active' : 'workspace-tab'}
              onClick={() => onOpenProject(tabProject.id)}
            >
              <Circle size={7} fill="currentColor" />
              <span>
                {workspaceTypes[tabWorkspace.type].label} / {tabProject.title}
              </span>
            </button>
          )
        })}
        <button className="tab-more" title="更多标签">
          <MoreHorizontal size={18} />
        </button>
      </nav>

      <div className="breadcrumb">
        <button onClick={onSwitchWorkspace}>切换工作空间</button>
        <ChevronRight size={14} />
        <button onClick={onHome}>
          {workspaceType.label} / {workspace.name}
        </button>
        {screen === 'knowledge' && (
          <>
            <ChevronRight size={14} />
            <span>{project.title}</span>
          </>
        )}
      </div>
    </header>
  )
}

function WorkspaceSidebar({ workspace, workspaceType, activeScreen, onNavigate, onSwitchWorkspace }) {
  const visibleNav = navItems.filter((item) => {
    if (item.localOnly) return workspace.type === 'local'
    if (item.serviceOnly) return workspace.type === 'service'
    return true
  })
  const Icon = workspaceType.icon

  return (
    <aside className="workspace-sidebar">
      <div className="current-space-card">
        <span className={`workspace-icon ${workspaceType.color}`}>
          <Icon size={20} />
        </span>
        <div>
          <strong>{workspace.name}</strong>
          <span>{workspaceType.label}工作空间 · {deploymentLabel(workspace)}</span>
          <em>{workspace.status}</em>
        </div>
      </div>

      <button className="switch-space-button" onClick={onSwitchWorkspace}>
        切换工作空间
      </button>

      <nav className="space-nav">
        {visibleNav.map((item) => {
          const NavIcon = item.icon
          return (
            <button
              key={item.id}
              className={activeScreen === item.id ? 'active' : ''}
              onClick={() => onNavigate(item.id)}
            >
              <NavIcon size={18} />
              {item.label}
            </button>
          )
        })}
      </nav>

      <div className="side-tools">
        {workspace.type === 'local' ? (
          <>
            <button onClick={() => onNavigate('backup')}>
              <ShieldCheck size={16} />
              加密备份
            </button>
            <button onClick={() => onNavigate('backup')}>
              <Download size={16} />
              恢复备份
            </button>
          </>
        ) : (
          <>
            <button>
              <Upload size={16} />
              导入
            </button>
            <button>
              <Download size={16} />
              导出
            </button>
          </>
        )}
      </div>
    </aside>
  )
}

function ProjectList({ workspace, workspaceType, projects: projectList, onOpenProject }) {
  const isLocal = workspace.type === 'local'

  return (
    <main className="team-workspace">
      <section className="team-header">
        <div>
          <span className="eyebrow">{workspaceType.label}工作空间</span>
          <h1>{workspace.name}</h1>
          <p>{workspace.desc}</p>
        </div>
        <div className="header-actions">
          <span className="role-badge">{isLocal ? '免登录' : deploymentLabel(workspace)}</span>
          <button className="primary-action">
            <Plus size={16} />
            新建项目
          </button>
        </div>
      </section>

      <section className="mode-explain">
        <Database size={18} />
        <span>
          {isLocal
            ? '本地库固定为单个个人空间，适合离线使用和本机资料管理。'
            : '服务端空间通过统一 HTTP API 管理项目、成员、邀请、权限与审计；官方云和自部署只区别服务地址。'}
        </span>
      </section>

      <section className="toolbar-line">
        <div className="view-switch">
          <button className="active" title="卡片视图">
            <Grid2X2 size={17} />
          </button>
          <button title="列表视图">
            <List size={17} />
          </button>
        </div>
        <button className="sort-button" title="排序">
          <ArrowUpDown size={16} />
        </button>
      </section>

      <section className="project-grid">
        {projectList.map((project) => (
          <button className="project-card" key={project.id} onClick={() => onOpenProject(project.id)}>
            <ProjectAvatar tone={project.tone} />
            <span className="project-tag">{project.tag}</span>
            <strong>{project.title}</strong>
            <p>{project.desc}</p>
            <footer>
              <span>{project.count} 条资料</span>
              <span>{project.updated}</span>
            </footer>
          </button>
        ))}
      </section>
    </main>
  )
}

function MembersPanel({ workspace }) {
  const members = [
    { name: '陈工', role: '所有者', status: '已加入' },
    { name: '李工', role: '管理员', status: '已加入' },
    { name: '王工', role: '编辑者', status: '邀请中' },
  ]

  return (
    <main className="team-workspace">
      <section className="team-header">
        <div>
          <span className="eyebrow">服务端协作</span>
          <h1>成员与邀请</h1>
          <p>{workspace.name} 可以在这里邀请成员、分配角色并管理访问权限。</p>
        </div>
        <button className="primary-action">
          <Mail size={16} />
          邀请成员
        </button>
      </section>

      <section className="member-table">
        {members.map((member) => (
          <div className="member-row" key={member.name}>
            <span>{member.name}</span>
            <strong>{member.role}</strong>
            <em>{member.status}</em>
          </div>
        ))}
      </section>
    </main>
  )
}

function BackupPanel() {
  const backupItems = [
    {
      title: '加密备份',
      desc: '将本地数据库、密码条目、链接索引和备注打包为加密备份文件。',
      action: '创建备份',
      icon: ShieldCheck,
    },
    {
      title: '恢复备份',
      desc: '选择 .deekbak 文件并输入备份密码，恢复到当前本地个人库。',
      action: '选择文件',
      icon: Download,
    },
    {
      title: '自动备份',
      desc: '设置备份目录和频率，例如每天或每周自动生成加密快照。',
      action: '设置规则',
      icon: Database,
    },
    {
      title: '迁移到服务端',
      desc: '登录服务端空间后，将本地项目导入指定团队或自部署服务。',
      action: '开始迁移',
      icon: Cloud,
    },
  ]

  return (
    <main className="team-workspace">
      <section className="team-header">
        <div>
          <span className="eyebrow">本地安全</span>
          <h1>备份与恢复</h1>
          <p>本地个人库免登录使用，因此备份、加密和恢复能力需要放在显眼的位置。</p>
        </div>
      </section>

      <section className="mode-explain">
        <Database size={18} />
        <span>建议格式：SQLite 快照 + 附件索引 + 元数据清单，压缩后使用 AES-GCM 加密生成 .deekbak。</span>
      </section>

      <section className="backup-grid">
        {backupItems.map((item) => {
          const Icon = item.icon
          return (
            <article className="backup-card" key={item.title}>
              <span className="backup-icon">
                <Icon size={22} />
              </span>
              <strong>{item.title}</strong>
              <p>{item.desc}</p>
              <button className="ghost-action">{item.action}</button>
            </article>
          )
        })}
      </section>
    </main>
  )
}

function SettingsPanel({ workspace }) {
  const isLocal = workspace.type === 'local'
  const cards = isLocal
    ? [
        ['数据库位置', 'D:\\DeekPM\\local.db'],
        ['本地库加密', '已启用，启动后解锁'],
        ['自动备份', '每天 20:00 加密备份'],
        ['备份目录', 'D:\\DeekPM\\backup'],
      ]
    : [
        ['服务地址', workspace.serviceUrl],
        ['认证来源', workspace.deployment === 'cloud' ? 'Deek 官方账号' : '自部署服务账号'],
        ['成员权限', '所有者 / 管理员 / 编辑者 / 只读'],
        ['审计记录', '记录成员查看、编辑和导出行为'],
      ]

  return (
    <main className="team-workspace">
      <section className="team-header">
        <div>
          <span className="eyebrow">空间设置</span>
          <h1>{workspace.name}</h1>
          <p>{isLocal ? '管理本地库的加密、备份与存储位置。' : '管理服务端空间的服务地址、认证、权限和安全策略。'}</p>
        </div>
      </section>

      <section className="settings-grid">
        {cards.map(([label, value]) => (
          <article className="setting-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </section>
    </main>
  )
}

function KnowledgeWorkspace({
  workspace,
  workspaceType,
  project,
  selectedEntry,
  selectedEntryId,
  setSelectedEntryId,
  visibleSecrets,
  setVisibleSecrets,
}) {
  return (
    <main className="knowledge-layout">
      <aside className="knowledge-tree">
        <div className="tree-toolbar">
          <div>
            <strong>智库</strong>
            <span>{project.title}</span>
          </div>
          <button title="新建条目">
            <Plus size={17} />
          </button>
        </div>

        <label className="search-box">
          <Search size={16} />
          <input placeholder="搜索条目、备注、链接" />
        </label>

        <div className="create-strip">
          <button>
            <FileText size={15} />
            文本
          </button>
          <button>
            <KeyRound size={15} />
            密码
          </button>
          <button>
            <Link size={15} />
            链接
          </button>
        </div>

        <div className="tree-list">
          {knowledgeTree.map((group) => (
            <div className="tree-group" key={group.id}>
              <div className="tree-group-title">
                <ChevronRight size={14} />
                {group.name}
              </div>
              {group.children.map((item) => {
                const meta = entryTypeMeta[item.type]
                const Icon = meta.icon
                return (
                  <button
                    className={selectedEntryId === item.id ? 'tree-item active' : 'tree-item'}
                    key={item.id}
                    onClick={() => setSelectedEntryId(item.id)}
                  >
                    <Icon size={15} />
                    <span>{item.name}</span>
                    <em>{meta.label}</em>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </aside>

      <DetailPanel
        workspace={workspace}
        workspaceType={workspaceType}
        project={project}
        entry={selectedEntry}
        visibleSecrets={visibleSecrets}
        setVisibleSecrets={setVisibleSecrets}
      />
    </main>
  )
}

function DetailPanel({ workspace, workspaceType, project, entry, visibleSecrets, setVisibleSecrets }) {
  const meta = entryTypeMeta[entry.type]
  const Icon = meta.icon

  return (
    <section className="detail-panel">
      <div className="detail-header">
        <div>
          <div className="type-badge">
            <Icon size={17} />
            {meta.label}
          </div>
          <h1>{entry.title}</h1>
          <p>{entry.remark}</p>
        </div>
        <div className="detail-actions">
          <button className="ghost-action">编辑</button>
          <button className="primary-action compact">
            <Plus size={16} />
            新建条目
          </button>
        </div>
      </div>

      <div className="meta-line">
        <span>所属项目：{project.title}</span>
        <span>工作空间：{workspaceType.label} / {workspace.name}</span>
        <span>创建时间：{entry.createdAt}</span>
      </div>

      {entry.type === 'text' && (
        <div className="editor-shell">
          <div className="editor-toolbar">
            <button>B</button>
            <button>I</button>
            <button>
              <Link size={15} />
            </button>
          </div>
          <div className="rich-text">{entry.body}</div>
        </div>
      )}

      {entry.type === 'password' && (
        <div className="secret-list">
          {entry.secrets.map((secret, index) => {
            const shown = visibleSecrets[index]
            return (
              <div className="secret-row" key={secret.name}>
                <div>
                  <span>{secret.name}</span>
                  <strong>{shown ? secret.value : maskSecret(secret.value)}</strong>
                </div>
                <button
                  title={shown ? '隐藏内容' : '显示内容'}
                  onClick={() =>
                    setVisibleSecrets((current) => ({ ...current, [index]: !current[index] }))
                  }
                >
                  {shown ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            )
          })}
          <button className="add-line">
            <Plus size={16} />
            添加名称和内容
          </button>
        </div>
      )}

      {entry.type === 'link' && (
        <div className="link-list">
          {entry.links.map((item) => (
            <div className="link-row" key={item.path}>
              <div className="link-icon">
                <Link size={17} />
              </div>
              <div>
                <strong>{item.name}</strong>
                <span>{item.path}</span>
              </div>
              <button>打开</button>
            </div>
          ))}
          <button className="add-line">
            <Plus size={16} />
            选择本地文件或链接
          </button>
        </div>
      )}

      <section className="entry-form-preview">
        <h2>编辑表单预览</h2>
        <div className="form-grid">
          <label>
            <span>条目名称</span>
            <input defaultValue={entry.title} />
          </label>
          <label>
            <span>备注</span>
            <input defaultValue={entry.remark} />
          </label>
          <label>
            <span>标签</span>
            <input defaultValue="环境 / 交接 / 重要" />
          </label>
          <label>
            <span>更新时间</span>
            <input defaultValue="自动记录" />
          </label>
        </div>
      </section>

      <div className="storage-note">
        <Database size={17} />
        <span>UI 只调用统一 Repository；本地使用 LocalRepository，服务端使用 ServerRepository，官方云和自部署只切换 Base URL。</span>
      </div>
    </section>
  )
}

function ProjectAvatar({ tone, small = false }) {
  return (
    <span className={`project-avatar ${tone} ${small ? 'small' : ''}`}>
      <Folder size={small ? 18 : 24} />
    </span>
  )
}

function deploymentLabel(workspace) {
  if (workspace.type === 'local') return '本机存储'
  return workspace.deployment === 'cloud' ? '官方云服务' : '自部署服务'
}

function maskSecret(value) {
  return value.replace(/[^\s/]/g, '•')
}

export default App
