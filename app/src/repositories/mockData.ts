import type { KnowledgeEntryDetail, KnowledgeGroup, Project, Workspace } from '../domain/types'

export const workspaces: Workspace[] = [
  {
    id: 'local-personal',
    type: 'local',
    deployment: 'local',
    name: '本地个人库',
    description: '固定在当前电脑上的个人资料库，免登录使用，支持加密备份和恢复。',
    status: '本机 SQLCipher / 路径索引',
  },
  {
    id: 'service-insight',
    type: 'service',
    deployment: 'cloud',
    name: 'Insight 团队',
    description: '官方云服务中的研发协作空间，适合多人项目资料管理。',
    status: 'Deek Cloud / 团队所有者',
    serviceUrl: 'https://api.deek.pm',
  },
  {
    id: 'service-company',
    type: 'service',
    deployment: 'selfhost',
    name: '公司 A 内网库',
    description: '企业自部署服务中的项目资料空间，连接公司自己的服务端。',
    status: 'https://pm.company.local',
    serviceUrl: 'https://pm.company.local',
  },
]

export const projects: Project[] = [
  {
    id: 'local-admin',
    workspaceId: 'local-personal',
    name: '本机管理系统资料',
    description: '个人电脑上的项目说明、账号密码、本地文件和快捷入口。',
    tag: '本地项目',
    entryCount: 18,
    updatedAtText: '今天 09:40',
    tone: 'blue',
  },
  {
    id: 'local-notes',
    workspaceId: 'local-personal',
    name: '个人资料库',
    description: '常用脚本、工具链接、临时账号和交接备注。',
    tag: '个人库',
    entryCount: 9,
    updatedAtText: '昨天 21:16',
    tone: 'green',
  },
  {
    id: 'young-admin',
    workspaceId: 'service-insight',
    name: '若依管理系统',
    description: '后台项目的说明文档、账号密码、本地文件和线上入口。',
    tag: 'Web 项目',
    entryCount: 24,
    updatedAtText: '今天 10:18',
    tone: 'violet',
  },
  {
    id: 'erp-private',
    workspaceId: 'service-company',
    name: '企业 ERP 私有库',
    description: '企业内网部署后的项目资料、权限、账号和审计记录。',
    tag: '自部署',
    entryCount: 37,
    updatedAtText: '今天 08:52',
    tone: 'slate',
  },
]

const baseGroups = (projectId: string): KnowledgeGroup[] => [
  {
    id: `${projectId}-basic`,
    projectId,
    name: '项目基础资料',
    entries: [
      { id: `${projectId}-overview`, title: '项目说明', type: 'text' },
      { id: `${projectId}-local-docs`, title: '本地设计稿与文档', type: 'link' },
    ],
  },
  {
    id: `${projectId}-env`,
    projectId,
    name: '环境与账号',
    entries: [
      { id: `${projectId}-dev-accounts`, title: '开发环境账号', type: 'password' },
      { id: `${projectId}-prod-links`, title: '生产环境入口', type: 'link' },
    ],
  },
]

export const knowledgeGroups: KnowledgeGroup[] = projects.flatMap((project) => baseGroups(project.id))

export const entries: Record<string, KnowledgeEntryDetail> = Object.fromEntries(
  projects.flatMap((project) => [
    [
      `${project.id}-overview`,
      {
        id: `${project.id}-overview`,
        projectId: project.id,
        title: '项目说明',
        type: 'text',
        remark: '记录项目背景、关键联系人、部署约定等基础信息。',
        tags: ['基础', '交接'],
        createdAt: '2026-05-28 10:03',
        updatedAt: '2026-05-28 10:20',
        textContent:
          '这是文本型条目的示例内容。后续将使用 TipTap JSON 作为主存储格式，并支持本地链接、Markdown 导入导出等能力。',
      },
    ],
    [
      `${project.id}-local-docs`,
      {
        id: `${project.id}-local-docs`,
        projectId: project.id,
        title: '本地设计稿与文档',
        type: 'link',
        remark: '本地文件、文件夹或网页链接只保存引用路径，不复制原始内容。',
        tags: ['链接', '设计'],
        createdAt: '2026-05-28 10:06',
        updatedAt: '2026-05-28 10:18',
        linkItems: [
          { id: `${project.id}-link-1`, name: '产品原型', targetType: 'file', target: 'D:\\work\\prototype\\deek-pm.rp' },
          { id: `${project.id}-link-2`, name: 'UI 目录', targetType: 'folder', target: 'D:\\work\\design\\deek-pm' },
        ],
      },
    ],
    [
      `${project.id}-dev-accounts`,
      {
        id: `${project.id}-dev-accounts`,
        projectId: project.id,
        title: '开发环境账号',
        type: 'password',
        remark: '密码字段在 SQLCipher 整库加密外，再做应用层字段级加密。',
        tags: ['账号', '敏感'],
        createdAt: '2026-05-28 10:11',
        updatedAt: '2026-05-28 10:19',
        passwordItems: [
          { id: `${project.id}-pwd-1`, name: '测试库账号', valuePreview: 'postgres / deek_dev_2026' },
          { id: `${project.id}-pwd-2`, name: '对象存储 AccessKey', valuePreview: 'AKIA-LOCAL-DEMO-2026' },
        ],
      },
    ],
    [
      `${project.id}-prod-links`,
      {
        id: `${project.id}-prod-links`,
        projectId: project.id,
        title: '生产环境入口',
        type: 'link',
        remark: '可挂线上地址，也可挂本地快捷方式。',
        tags: ['生产', '入口'],
        createdAt: '2026-05-28 10:14',
        updatedAt: '2026-05-28 10:22',
        linkItems: [{ id: `${project.id}-link-3`, name: '生产控制台', targetType: 'url', target: 'https://console.example.com' }],
      },
    ],
  ]),
) as Record<string, KnowledgeEntryDetail>
