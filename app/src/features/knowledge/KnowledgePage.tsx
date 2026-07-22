import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { useParams } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCreateBlockNote, useEditorChange } from '@blocknote/react'
import { BlockNoteSchema, createCodeBlockSpec, defaultBlockSpecs } from '@blocknote/core'
import type { PartialBlock } from '@blocknote/core'
import { codeBlockOptions } from '@blocknote/code-block'
import { BlockNoteView } from '@blocknote/mantine'
import { zh } from '@blocknote/core/locales'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import { AnimatePresence, LazyMotion, domAnimation, m } from 'motion/react'
import {
  Archive,
  BookOpenText,
  ChevronDown,
  ChevronRight,
  Clipboard,
  Code2,
  Eye,
  EyeOff,
  FileCode2,
  FilePlus2,
  FileText,
  KeyRound,
  LinkIcon,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Smile,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
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
import { TextInput } from '../../components/ui/field'
import { Label } from '../../components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'
import { Textarea } from '../../components/ui/textarea'
import type { EntryType, KnowledgeEntryDetail, KnowledgeEntrySummary, KnowledgeGroup, LinkEntryItem, LinkTargetType, PasswordEntryItem, ProjectAttachment, ProjectTone } from '../../domain/types'
import { useRepositories, useRepositorySource } from '../../repositories/repositoryContext'
import { cn } from '../../shared/cn'
import { useWorkspaceTabs } from '../../stores/workspaceTabs'

const entryIcon: Record<EntryType, LucideIcon> = {
  text: FileText,
  password: KeyRound,
  link: LinkIcon,
}

const entryTypeText: Record<EntryType, string> = {
  text: '文本',
  password: '账号',
  link: '链接',
}

const pageIconCategories = [
  { name: '常用', icons: ['😀', '😄', '🙂', '🤔', '🤣', '🥲', '😎', '🤖', '👀', '✨', '⭐', '🔥', '🎯', '✅', '🚀', '💡', '🧠', '🔐', '🔗', '📌'] },
  { name: '文档', icons: ['📄', '📝', '📚', '📖', '📕', '📗', '📘', '📙', '📓', '📔', '📒', '🗒️', '🧾', '📋', '📎', '🗂️', '📁', '🗃️', '🗄️', '📰'] },
  { name: '工作', icons: ['💻', '🖥️', '⌨️', '🖱️', '📱', '🧪', '🧬', '🧰', '🛠️', '⚙️', '🔧', '🔨', '📊', '📈', '📉', '🧮', '🧭', '🗺️', '📦', '🏷️'] },
  { name: '技术', icons: ['🌐', '🛰️', '🧩', '🧱', '🕸️', '🗜️', '🧲', '🔌', '💾', '💿', '📡', '🛜', '🔋', '🪫', '🐳', '🦀', '🐍', '☕', '🟨', '🟦'] },
  { name: '生活', icons: ['🏠', '🏢', '🏫', '🏕️', '🌿', '🌱', '☕', '🍵', '🍎', '🍜', '🎧', '🎬', '🎨', '🎮', '🏃', '🧘', '✈️', '🚗', '⏰', '📅'] },
  { name: '标记', icons: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '❗', '❓', '⚠️', '⛔', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪'] },
]

const linkTargetTypeText: Record<LinkTargetType, string> = {
  file: '文件',
  folder: '目录',
  url: '网址',
}

type ProjectView = 'knowledge' | 'settings'
type EditorMode = 'visual' | 'source' | 'code'

const emptyGroups: KnowledgeGroup[] = []
const emptyAttachments: ProjectAttachment[] = []
const {
  text,
  shellscript,
  javascript,
  typescript,
  tsx,
  jsx,
  python,
  java,
  csharp,
  cpp,
  c,
  rust,
  kotlin,
  sql,
  json,
  jsonc,
  yaml,
  html,
  css,
  markdown,
  ...additionalCodeLanguages
} = codeBlockOptions.supportedLanguages
const deekCodeBlockOptions = {
  ...codeBlockOptions,
  supportedLanguages: {
    text,
    shellscript: { ...shellscript, name: 'Bash / Shell' },
    javascript,
    typescript,
    tsx,
    jsx,
    python,
    java,
    csharp,
    cpp,
    c,
    rust,
    kotlin,
    sql,
    json,
    jsonc,
    yaml,
    html,
    css,
    markdown,
    ...additionalCodeLanguages,
  },
}
const blockNoteSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    codeBlock: createCodeBlockSpec(deekCodeBlockOptions),
  },
})
const standardEase = [0.22, 1, 0.36, 1] as const
const pageMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.18, ease: standardEase },
}

type TreeKnowledgePage = KnowledgeEntrySummary & { groupId: string; children: TreeKnowledgePage[] }

export function KnowledgePage() {
  const repositories = useRepositories()
  const queryClient = useQueryClient()
  const openProjectTab = useWorkspaceTabs((state) => state.openProjectTab)
  const { projectId = '' } = useParams({ strict: false })
  const [activeView, setActiveView] = useState<ProjectView>('knowledge')
  const [expandedGroupIds, setExpandedGroupIds] = useState<Record<string, boolean>>({})
  const [selectedEntryId, setSelectedEntryId] = useState('')
  const [visibleSecrets, setVisibleSecrets] = useState<Record<string, boolean>>({})
  const [copyMessage, setCopyMessage] = useState('')
  const [searchText, setSearchText] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [pendingDeleteEntryId, setPendingDeleteEntryId] = useState('')
  const [treeMenu, setTreeMenu] = useState<{ page: TreeKnowledgePage; x: number; y: number } | null>(null)
  const [iconPicker, setIconPicker] = useState<{ entry: KnowledgeEntrySummary; x: number; y: number } | null>(null)
  const pendingCreateGroupIdRef = useRef('')
  const pendingCreatedGroupRef = useRef<KnowledgeGroup | null>(null)
  const pendingParentEntryIdRef = useRef('')
  const [editValues, setEditValues] = useState({
    title: '',
    remark: '',
    textContent: '',
    passwordItems: [] as PasswordEntryItem[],
    linkItems: [] as LinkEntryItem[],
  })

  const { data: project, error: projectError, isPending: projectPending } = useQuery({ queryKey: ['project', projectId], queryFn: () => repositories.project.getProject(projectId) })
  const { data: groups = emptyGroups } = useQuery({ queryKey: ['knowledge-groups', projectId], queryFn: () => repositories.knowledge.listGroups(projectId) })
  const setKnowledgeGroupsCache = useCallback(
    (updater: (current: KnowledgeGroup[]) => KnowledgeGroup[]) => {
      queryClient.setQueryData<KnowledgeGroup[]>(['knowledge-groups', projectId], (current) => updater(current ?? []))
    },
    [projectId, queryClient],
  )
  const normalizedSearch = searchText.trim().toLocaleLowerCase()
  const { data: matchedEntryIds = [] } = useQuery({
    queryKey: ['entry-search', projectId, normalizedSearch],
    queryFn: () => repositories.knowledge.searchEntryIds(projectId, normalizedSearch),
    enabled: Boolean(normalizedSearch),
  })
  const entrySearchIndex = useMemo(() => {
    return new Map(matchedEntryIds.map((id) => [id, normalizedSearch]))
  }, [matchedEntryIds, normalizedSearch])
  const visibleGroups = useMemo(() => filterGroupsBySearch(groups, entrySearchIndex, normalizedSearch), [entrySearchIndex, groups, normalizedSearch])
  const fullPageTree = useMemo(() => buildPageTree(groups), [groups])
  const visiblePageTree = useMemo(() => buildPageTree(visibleGroups), [visibleGroups])
  const visibleEntryIds = useMemo(() => new Set(visibleGroups.flatMap((group) => group.entries.map((entry) => entry.id))), [visibleGroups])
  const activeEntryId = selectedEntryId && visibleEntryIds.has(selectedEntryId) ? selectedEntryId : visiblePageTree[0]?.id ?? visibleGroups[0]?.entries[0]?.id
  const activeEntryGroupId = useMemo(() => groups.find((group) => group.entries.some((item) => item.id === activeEntryId))?.id ?? '', [activeEntryId, groups])
  const activePage = useMemo(() => findPageById(fullPageTree, activeEntryId ?? ''), [activeEntryId, fullPageTree])
  const { data: entry } = useQuery({
    queryKey: ['entry', projectId, activeEntryId],
    queryFn: () => (activeEntryId ? repositories.knowledge.getEntry(activeEntryId) : undefined),
    enabled: Boolean(activeEntryId) && activeView === 'knowledge',
  })

  const createEntryMutation = useMutation({
    mutationFn: async (input: { type: EntryType; groupId?: string; parentEntryId?: string; title: string; remark: string }) => {
      pendingCreatedGroupRef.current = null
      pendingParentEntryIdRef.current = input.parentEntryId ?? ''
      let group = groups.find((item) => item.id === input.groupId) ?? groups.find((item) => item.id === activeEntryGroupId) ?? groups[0]
      if (!group) {
        group = await repositories.knowledge.createGroup({ projectId, name: '我的页面' })
        pendingCreatedGroupRef.current = group
      }
      pendingCreateGroupIdRef.current = group.id
      return repositories.knowledge.createEntry({
        projectId,
        groupId: group.id,
        parentEntryId: input.parentEntryId,
        type: input.type,
        title: input.title.trim() || (input.type === 'text' ? '新页面' : `未命名${entryTypeText[input.type]}`),
        remark: input.remark.trim(),
      })
    },
    onSuccess: (createdEntry) => {
      const createdGroup = pendingCreatedGroupRef.current
      setSearchText('')
      setExpandedGroupIds((current) => ({ ...current, ...(pendingParentEntryIdRef.current ? { [pendingParentEntryIdRef.current]: true } : {}) }))
      setSelectedEntryId(createdEntry.id)
      setActiveView('knowledge')
      setKnowledgeGroupsCache((current) => {
        const groupExists = current.some((group) => group.id === pendingCreateGroupIdRef.current)
        const nextGroups = groupExists || !createdGroup ? current : [...current, createdGroup]
        return nextGroups.map((group) =>
          group.id === pendingCreateGroupIdRef.current
            ? {
                ...group,
                entries: group.entries.some((item) => item.id === createdEntry.id)
                  ? group.entries
                  : [...group.entries, { id: createdEntry.id, title: createdEntry.title, type: createdEntry.type, icon: createdEntry.icon, parentEntryId: createdEntry.parentEntryId }],
              }
            : group,
        )
      })
      pendingCreatedGroupRef.current = null
      pendingParentEntryIdRef.current = ''
      void queryClient.invalidateQueries({ queryKey: ['knowledge-groups', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['project', projectId] })
    },
  })
  const updateEntryMutation = useMutation({
    mutationFn: async () => {
      if (!entry) throw new Error('缺少条目')
      return repositories.knowledge.updateEntry({
        id: entry.id,
        title: editValues.title.trim() || entry.title,
        remark: editValues.remark.trim(),
        textContent: entry.type === 'text' ? editValues.textContent : undefined,
        passwordItems: entry.type === 'password' ? editValues.passwordItems : undefined,
        linkItems: entry.type === 'link' ? editValues.linkItems : undefined,
      })
    },
    onSuccess: (updatedEntry) => {
      setEditOpen(false)
      if (updatedEntry) {
        setKnowledgeGroupsCache((current) =>
          current.map((group) => ({
            ...group,
            entries: group.entries.map((item) => (item.id === updatedEntry.id ? { id: updatedEntry.id, title: updatedEntry.title, type: updatedEntry.type, icon: updatedEntry.icon, parentEntryId: updatedEntry.parentEntryId } : item)),
          })),
        )
      }
      void queryClient.invalidateQueries({ queryKey: ['knowledge-groups', projectId] })
      if (updatedEntry) void queryClient.invalidateQueries({ queryKey: ['entry', projectId, updatedEntry.id] })
    },
  })
  const updateEntryIconMutation = useMutation({
    mutationFn: (input: { id: string; icon: string | null }) => repositories.knowledge.updateEntry(input),
    onSuccess: (updatedEntry) => {
      setIconPicker(null)
      if (!updatedEntry) return
      setKnowledgeGroupsCache((current) =>
        current.map((group) => ({
          ...group,
          entries: group.entries.map((item) =>
            item.id === updatedEntry.id
              ? { id: updatedEntry.id, title: updatedEntry.title, type: updatedEntry.type, icon: updatedEntry.icon, parentEntryId: updatedEntry.parentEntryId }
              : item,
          ),
        })),
      )
      queryClient.setQueryData(['entry', projectId, updatedEntry.id], updatedEntry)
      void queryClient.invalidateQueries({ queryKey: ['knowledge-groups', projectId] })
    },
  })
  const deleteEntryMutation = useMutation({
    mutationFn: () => {
      const targetEntryId = pendingDeleteEntryId || entry?.id
      if (!targetEntryId) throw new Error('缺少条目')
      return repositories.knowledge.deleteEntry(targetEntryId)
    },
    onSuccess: () => {
      setDeleteOpen(false)
      const deletedRootEntryId = pendingDeleteEntryId || entry?.id
      if (deletedRootEntryId) {
        const deletedEntryIds = collectPageDescendantIdsFromGroups(groups, deletedRootEntryId)
        setKnowledgeGroupsCache((current) =>
          current.map((group) => ({
            ...group,
            entries: group.entries.filter((item) => !deletedEntryIds.has(item.id)),
          })),
        )
        if (deletedEntryIds.has(selectedEntryId)) setSelectedEntryId('')
      }
      setPendingDeleteEntryId('')
      void queryClient.invalidateQueries({ queryKey: ['knowledge-groups', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['project', projectId] })
    },
  })
  useEffect(() => {
    if (!project) return
    openProjectTab({ workspaceId: project.workspaceId, projectId: project.id, title: project.name })
  }, [openProjectTab, project])

  if (projectPending) return <main className="grid h-full place-items-center text-sm text-muted-foreground">正在加载项目…</main>
  if (projectError || !project) {
    return (
      <main className="grid h-full place-items-center p-8">
        <Card className="max-w-md p-6 text-center">
          <h1 className="text-lg font-semibold">无法打开项目</h1>
          <p className="mt-2 text-sm text-muted-foreground">{projectError instanceof Error ? projectError.message : '项目不存在或已无法访问。'}</p>
        </Card>
      </main>
    )
  }
  const hasVisibleEntry = Boolean(entry && entry.projectId === projectId)
  const createPage = (parentPage?: TreeKnowledgePage) => {
    if (createEntryMutation.isPending) return
    const resolvedGroupId = parentPage?.groupId ?? activePage?.groupId ?? visibleGroups[0]?.id ?? groups[0]?.id
    createEntryMutation.mutate({ type: 'text', groupId: resolvedGroupId, parentEntryId: parentPage?.id, title: '新页面', remark: '' })
  }
  const openEditDialog = () => {
    if (!entry) return
    setEditValues({
      title: entry.title,
      remark: entry.remark,
      textContent: entry.textContent ?? '',
      passwordItems: entry.passwordItems?.map((item) => ({ ...item })) ?? [],
      linkItems: entry.linkItems?.map((item) => ({ ...item })) ?? [],
    })
    setEditOpen(true)
  }
  const copyText = async (value: string, message: string) => {
    if (!value) return
    await navigator.clipboard?.writeText(value)
    setCopyMessage(message)
    window.setTimeout(() => setCopyMessage(''), 1800)
  }
  const toggleGroup = (groupId: string) => {
    setExpandedGroupIds((current) => ({ ...current, [groupId]: !(current[groupId] ?? true) }))
  }
  const openDeletePage = (entryId: string) => {
    setPendingDeleteEntryId(entryId)
    setSelectedEntryId(entryId)
    setDeleteOpen(true)
    setTreeMenu(null)
  }
  const openIconPicker = (entrySummary: KnowledgeEntrySummary, event: MouseEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setTreeMenu(null)
    setIconPicker({ entry: entrySummary, x: event.clientX, y: event.clientY })
  }
  return (
    <main
      className="deek-knowledge-shell grid h-full min-h-0 p-0 m-0"
      data-pane={activeView === 'knowledge' ? 'knowledge' : 'settings'}
      onClick={() => {
        setTreeMenu(null)
        setIconPicker(null)
      }}
    >
      <ProjectSectionMenu projectName={project.name} activeView={activeView} onSelectView={setActiveView} />
      <LazyMotion features={domAnimation}>
      {activeView === 'knowledge' && (
      <m.aside layout className="deek-knowledge-tree flex min-h-0 flex-col" transition={{ duration: 0.18, ease: standardEase }}>
        <div className="deek-knowledge-tree-header border-b px-3.5 pb-3 pt-3.5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <strong className="block truncate text-[length:var(--text-title3)] font-semibold tracking-[-0.02em]">智库</strong>
              <span className="mt-0.5 block truncate text-[length:var(--text-callout)] text-muted-foreground">{project.name}</span>
            </div>
            <Button size="icon" variant="ghost" aria-label="新建页面" disabled={createEntryMutation.isPending} onClick={() => createPage()}>
              <Plus size={17} strokeWidth={1.75} />
            </Button>
          </div>
          <label className="deek-knowledge-search flex h-[var(--control-h)] items-center gap-2 rounded-[var(--radius-control)] px-3 text-muted-foreground">
            <Search size={16} strokeWidth={1.75} />
            <input className="w-full border-0 bg-transparent text-[length:var(--text-body)] text-foreground outline-none placeholder:text-muted-foreground/70" placeholder="搜索页面" value={searchText} onChange={(event) => setSearchText(event.target.value)} />
          </label>
        </div>
        <div className="flex items-center justify-between px-3.5 py-2 text-[length:var(--text-caption)] font-semibold text-muted-foreground">
          <span>页面</span>
          <Button size="icon-sm" variant="ghost" aria-label="新建页面" disabled={createEntryMutation.isPending} onClick={() => createPage()}>
            <FilePlus2 size={15} strokeWidth={1.75} />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-2 pb-4">
          {visiblePageTree.map((page) => (
            <TreePage
              key={page.id}
              page={page}
              depth={0}
              activeEntryId={activeEntryId ?? ''}
              expandedGroupIds={expandedGroupIds}
              forceExpanded={Boolean(normalizedSearch)}
              onToggle={toggleGroup}
              onSelectEntry={setSelectedEntryId}
              onCreatePage={createPage}
              onOpenMenu={setTreeMenu}
              onOpenIconPicker={openIconPicker}
            />
          ))}
          <AnimatePresence>
            {visiblePageTree.length === 0 && (
              <m.div {...pageMotion} className="rounded-[var(--radius-control)] border border-dashed bg-[var(--surface-elevated)] p-5 text-[length:var(--text-body)] text-muted-foreground">
                暂无页面
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </m.aside>
      )}
      <section className="deek-knowledge-editor h-full max-h-full min-h-0 overflow-y-auto overscroll-contain">
        <div className="deek-knowledge-editor-inner w-full max-w-none">
          {copyMessage && <div className="mb-4 rounded-md border bg-[var(--surface-elevated)] px-4 py-3 text-sm text-muted-foreground shadow-[var(--shadow-control)]">{copyMessage}</div>}
          <AnimatePresence mode="wait">
          {activeView === 'settings' && (
            <m.div key="settings" {...pageMotion} className="min-h-[calc(100dvh-7rem)]">
              <ProjectSettingsPanel project={project} />
            </m.div>
          )}
          {activeView === 'knowledge' && hasVisibleEntry && entry && (
            <m.div key={entry.id} {...pageMotion} className="min-h-[calc(100dvh-7rem)]">
              {entry.type === 'text' && (
                <EditableTextEntry
                  entry={entry}
                  projectId={projectId}
                  workspaceId={project.workspaceId}
                  setKnowledgeGroupsCache={setKnowledgeGroupsCache}
                  childPages={activePage?.children ?? []}
                  onOpenPage={setSelectedEntryId}
                  onCreateChildPage={() => activePage && createPage(activePage)}
                  onDelete={() => entry && openDeletePage(entry.id)}
                  onOpenIconPicker={openIconPicker}
                />
              )}
              {entry.type === 'password' && (
                <>
                  <LegacyEntryHeader entry={entry} onEdit={openEditDialog} onDelete={() => openDeletePage(entry.id)} />
                  <div className="overflow-hidden rounded-lg border bg-[var(--surface-elevated)] shadow-[var(--shadow-control)]">
                    {entry.passwordItems?.map((item) => {
                      const shown = Boolean(visibleSecrets[item.id])
                      return (
                        <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b px-5 py-4 last:border-b-0">
                          <div className="min-w-0">
                            <span className="block text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{item.name}</span>
                            <strong className="mt-1 block truncate font-mono text-sm">{shown ? item.valuePreview : '••••••••••••••••'}</strong>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button size="icon" variant="ghost" aria-label={shown ? '隐藏' : '显示'} onClick={() => setVisibleSecrets((current) => ({ ...current, [item.id]: !shown }))}>
                              {shown ? <EyeOff size={16} /> : <Eye size={16} />}
                            </Button>
                            <Button size="icon" variant="ghost" aria-label="复制" onClick={() => void copyText(item.valuePreview, `已复制：${item.name}`)}>
                              <Clipboard size={16} />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
              {entry.type === 'link' && (
                <>
                  <LegacyEntryHeader entry={entry} onEdit={openEditDialog} onDelete={() => openDeletePage(entry.id)} />
                  <div className="overflow-hidden rounded-lg border bg-[var(--surface-elevated)] shadow-[var(--shadow-control)]">
                    {entry.linkItems?.map((item) => (
                      <div key={item.id} className="grid grid-cols-[40px_minmax(0,1fr)_auto_auto_auto] items-center gap-3 border-b px-5 py-4 last:border-b-0">
                        <span className="grid h-10 w-10 place-items-center rounded-md border bg-muted/30 text-muted-foreground"><LinkIcon size={17} /></span>
                        <div className="min-w-0 flex-1">
                          <strong className="block text-sm">{item.name}</strong>
                          <span className="block truncate text-sm text-muted-foreground">{item.target}</span>
                        </div>
                        <Badge variant="outline">{linkTargetTypeText[item.targetType]}</Badge>
                        <Button size="icon" variant="ghost" aria-label="复制链接" onClick={() => void copyText(item.target, `已复制：${item.name}`)}><Clipboard size={16} /></Button>
                        <Button variant="outline" className="bg-[var(--surface-elevated)]" onClick={() => void window.deek?.openExternal(item.target)}>打开</Button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </m.div>
          )}
          {activeView === 'knowledge' && !hasVisibleEntry && (
            <m.div key="empty" {...pageMotion} className="min-h-[calc(100dvh-7rem)]">
              <KnowledgeEmptyState hasPages={groups.some((group) => group.entries.length > 0)} onCreatePage={() => createPage()} />
            </m.div>
          )}
          </AnimatePresence>
        </div>
      </section>
      </LazyMotion>
      <EntryDialogs
        workspaceId={project.workspaceId}
        editOpen={editOpen}
        setEditOpen={setEditOpen}
        editValues={editValues}
        setEditValues={setEditValues}
        updateEntryMutation={updateEntryMutation}
        deleteOpen={deleteOpen}
        setDeleteOpen={(open) => {
          setDeleteOpen(open)
          if (!open) setPendingDeleteEntryId('')
        }}
        deleteEntryMutation={deleteEntryMutation}
        entryType={entry?.type}
      />
      {treeMenu && (
        <TreeContextMenu
          page={treeMenu.page}
          x={treeMenu.x}
          y={treeMenu.y}
          onCreateChild={() => createPage(treeMenu.page)}
          onCopyTitle={() => {
            void navigator.clipboard?.writeText(treeMenu.page.title)
            setTreeMenu(null)
          }}
          onDelete={() => openDeletePage(treeMenu.page.id)}
        />
      )}
      {iconPicker && (
        <PageIconPicker
          entry={iconPicker.entry}
          x={iconPicker.x}
          y={iconPicker.y}
          isPending={updateEntryIconMutation.isPending}
          onSelect={(icon) => updateEntryIconMutation.mutate({ id: iconPicker.entry.id, icon })}
          onClear={() => updateEntryIconMutation.mutate({ id: iconPicker.entry.id, icon: null })}
        />
      )}
    </main>
  )
}

function ProjectSectionMenu({ projectName, activeView, onSelectView }: { projectName: string; activeView: ProjectView; onSelectView: (view: ProjectView) => void }) {
  const projectInitial = projectName.trim().slice(0, 1).toLocaleUpperCase() || 'P'
  const menuItems: Array<{ value: ProjectView; label: string; icon: LucideIcon }> = [
    { value: 'knowledge', label: '智库', icon: BookOpenText },
    { value: 'settings', label: '设置', icon: Settings },
  ]
  return (
    <aside className="deek-knowledge-rail flex min-h-0 flex-col items-center px-2.5 py-4 text-foreground">
      <div
        className="mb-6 grid h-11 w-11 place-items-center rounded-[0.7rem] bg-[var(--nav-item-active-bg)] text-[length:var(--text-body)] font-semibold text-foreground"
        title={projectName}
      >
        {projectInitial}
      </div>
      <nav className="grid gap-2">
        {menuItems.map((item) => {
          const Icon = item.icon
          const active = activeView === item.value
          return (
            <button
              key={item.value}
              type="button"
              className={cn(
                'deek-nav-item relative grid h-11 w-11 place-items-center rounded-[0.7rem]',
                active && 'deek-nav-item-active',
              )}
              title={item.label}
              aria-label={item.label}
              onClick={() => onSelectView(item.value)}
            >
              <Icon size={18} strokeWidth={1.75} />
            </button>
          )
        })}
      </nav>
    </aside>
  )
}

function TreePage(props: {
  page: TreeKnowledgePage
  depth: number
  activeEntryId: string
  expandedGroupIds: Record<string, boolean>
  forceExpanded: boolean
  onToggle: (entryId: string) => void
  onSelectEntry: (entryId: string) => void
  onCreatePage: (parentPage?: TreeKnowledgePage) => void
  onOpenMenu: (menu: { page: TreeKnowledgePage; x: number; y: number }) => void
  onOpenIconPicker: (entry: KnowledgeEntrySummary, event: MouseEvent<HTMLElement>) => void
}) {
  const expanded = props.forceExpanded || (props.expandedGroupIds[props.page.id] ?? false)
  const active = props.page.id === props.activeEntryId
  const Icon = entryIcon[props.page.type]
  return (
    <m.section layout className="mb-0.5" transition={{ duration: 0.18, ease: standardEase }}>
      <div
        className={cn(
          'deek-tree-row group/tree-row grid h-10 grid-cols-[minmax(0,1fr)_32px_32px] items-center gap-0 rounded-[0.55rem] transition',
          active ? 'deek-tree-row-active' : 'hover:bg-muted/50',
        )}
        style={{ paddingLeft: props.depth * 14 }}
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
          props.onSelectEntry(props.page.id)
          props.onOpenMenu({ page: props.page, x: event.clientX, y: event.clientY })
        }}
      >
        <button
          type="button"
          className={cn(
            'grid h-10 min-w-0 grid-cols-[18px_24px_minmax(0,1fr)] items-center gap-2 rounded px-2 text-left text-[length:var(--text-body)] leading-5',
            active ? 'font-medium' : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => {
            props.onSelectEntry(props.page.id)
          }}
          aria-expanded={expanded}
        >
          <span
            className="grid h-5 w-4 place-items-center rounded hover:bg-muted"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              props.onToggle(props.page.id)
            }}
          >
            {props.page.children.length > 0 ? (expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/45" />}
          </span>
          <span
            className={cn(
              'grid h-5 w-5 shrink-0 place-items-center rounded text-[14px] leading-none text-muted-foreground hover:bg-muted hover:text-foreground',
              props.page.icon && 'text-foreground',
            )}
            title="更换页面图标"
            onClick={(event) => props.onOpenIconPicker(props.page, event)}
          >
            {props.page.icon ? props.page.icon : <Icon size={14} />}
          </span>
          <span className="min-w-0 truncate leading-5">{props.page.title}</span>
        </button>
        <Button size="icon-sm" variant="ghost" className="mx-auto opacity-0 group-hover/tree-row:opacity-100" aria-label="新建子页面" onClick={() => props.onCreatePage(props.page)}>
          <Plus size={14} />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          className="mx-auto opacity-0 group-hover/tree-row:opacity-100"
          aria-label="页面操作"
          onClick={(event) => {
            event.stopPropagation()
            props.onOpenMenu({ page: props.page, x: event.clientX, y: event.clientY })
          }}
        >
          <MoreHorizontal size={14} />
        </Button>
      </div>
      <AnimatePresence initial={false}>
        {expanded && (
          <m.div
            layout
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: standardEase }}
            className="grid gap-1 overflow-hidden"
          >
            {props.page.children.map((child) => (
              <TreePage key={child.id} {...props} page={child} depth={props.depth + 1} />
            ))}
          </m.div>
        )}
      </AnimatePresence>
    </m.section>
  )
}

function KnowledgeEmptyState({ hasPages, onCreatePage }: { hasPages: boolean; onCreatePage: () => void }) {
  return (
    <Card className="grid min-h-80 place-items-center border-dashed bg-[var(--surface)] p-8 text-center shadow-none">
      <div className="max-w-sm">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-lg border bg-muted/40 text-muted-foreground">
          <BookOpenText size={20} />
        </span>
        <h2 className="mt-4 text-lg font-semibold">{hasPages ? '暂无匹配页面' : '还没有页面'}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{hasPages ? '当前搜索下没有内容。' : '直接创建第一张页面，然后在里面继续写或创建子页面。'}</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button onClick={onCreatePage}><Plus size={15} />新建页面</Button>
        </div>
      </div>
    </Card>
  )
}

function TreeContextMenu(props: {
  page: TreeKnowledgePage
  x: number
  y: number
  onCreateChild: () => void
  onCopyTitle: () => void
  onDelete: () => void
}) {
  return (
    <div
      className="fixed z-50 w-44 overflow-hidden rounded-md border bg-[var(--surface-elevated)] py-1 text-sm shadow-[var(--shadow-popover)]"
      style={{ left: props.x, top: props.y }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="truncate px-3 py-2 text-xs text-muted-foreground">{props.page.title || '新页面'}</div>
      <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted" onClick={props.onCreateChild}>
        <Plus size={14} />
        新建子页面
      </button>
      <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted" onClick={props.onCopyTitle}>
        <Clipboard size={14} />
        复制标题
      </button>
      <div className="my-1 h-px bg-border" />
      <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-destructive hover:bg-destructive/10" onClick={props.onDelete}>
        <Trash2 size={14} />
        删除页面
      </button>
    </div>
  )
}

function PageIconPicker(props: {
  entry: KnowledgeEntrySummary
  x: number
  y: number
  isPending: boolean
  onSelect: (icon: string) => void
  onClear: () => void
}) {
  const [activeCategory, setActiveCategory] = useState(pageIconCategories[0].name)
  const [customIcon, setCustomIcon] = useState('')
  const activeIcons = pageIconCategories.find((category) => category.name === activeCategory)?.icons ?? pageIconCategories[0].icons
  const left = Math.min(props.x, window.innerWidth - 328)
  const top = Math.min(props.y, window.innerHeight - 420)
  const submitCustomIcon = () => {
    const icon = customIcon.trim()
    if (!icon) return
    props.onSelect(icon.slice(0, 8))
  }
  return (
    <div
      className="fixed z-50 w-80 overflow-hidden rounded-lg border border-[var(--glass-border)] bg-[var(--surface-elevated)] shadow-[var(--shadow-popover)] backdrop-blur-[var(--glass-blur)]"
      style={{ left: Math.max(12, left), top: Math.max(12, top) }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="border-b px-3 py-2">
        <div className="truncate text-sm font-medium">{props.entry.title || '新页面'}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">选择页面图标</div>
      </div>
      <div className="flex gap-1 overflow-x-auto border-b px-2 py-2">
        {pageIconCategories.map((category) => (
          <button
            key={category.name}
            type="button"
            className={cn(
              'h-7 shrink-0 rounded-md px-2 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground',
              activeCategory === category.name && 'bg-muted text-foreground',
            )}
            onClick={() => setActiveCategory(category.name)}
          >
            {category.name}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-8 gap-1 p-2">
        {activeIcons.map((icon) => (
          <button
            key={icon}
            type="button"
            className={cn(
              'grid h-9 place-items-center rounded-md text-xl leading-none transition hover:bg-muted',
              props.entry.icon === icon && 'bg-[var(--primary)] text-primary-foreground hover:bg-[var(--primary)]',
            )}
            disabled={props.isPending}
            onClick={() => props.onSelect(icon)}
          >
            {icon}
          </button>
        ))}
      </div>
      <div className="grid gap-2 border-t p-2">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <input
            className="h-8 min-w-0 rounded-md border bg-background px-2 text-sm outline-none transition focus:border-[var(--primary)]"
            value={customIcon}
            maxLength={8}
            placeholder="自定义 emoji"
            onChange={(event) => setCustomIcon(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submitCustomIcon()
            }}
          />
          <Button size="sm" variant="outline" disabled={props.isPending || !customIcon.trim()} onClick={submitCustomIcon}>
            应用
          </Button>
        </div>
        <button
          type="button"
          className="flex h-8 w-full items-center justify-center rounded-md text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
          disabled={props.isPending || !props.entry.icon}
          onClick={props.onClear}
        >
          清除图标
        </button>
      </div>
    </div>
  )
}

function ProjectFilesPanel({ projectId, workspaceId, compact = false }: { projectId: string; workspaceId: string; compact?: boolean }) {
  const repositories = useRepositories()
  const source = useRepositorySource()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pathStats, setPathStats] = useState<Record<string, DeekPathStatResult>>({})
  const [attachmentMessage, setAttachmentMessage] = useState('')
  const { data: attachments = emptyAttachments } = useQuery({ queryKey: ['attachments', projectId], queryFn: () => repositories.attachment.listAttachments(projectId) })
  const attachmentSignature = useMemo(() => attachments.map((item) => `${item.id}:${item.target}`).join('|'), [attachments])
  const addAttachmentMutation = useMutation({
    mutationFn: (input: { kind: 'file' | 'directory'; path: string }) =>
      repositories.attachment.addAttachment({
        projectId,
        name: getPathName(input.path),
        targetType: input.kind === 'file' ? 'file' : 'folder',
        target: input.path,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['attachments', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['project', projectId] })
    },
  })
  const removeAttachmentMutation = useMutation({
    mutationFn: async (item: ProjectAttachment) => {
      await repositories.attachment.removeAttachment(item.id)
      if (item.assetId) await repositories.asset.deleteAsset(item.assetId)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['attachments', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['project', projectId] })
    },
  })
  const uploadAttachmentMutation = useMutation({
    mutationFn: async (input: { file?: File; filePath?: string }) => {
      const asset = input.filePath && repositories.asset.uploadAssetPath
        ? await repositories.asset.uploadAssetPath({ workspaceId, kind: 'attachment', filePath: input.filePath })
        : input.file
          ? await repositories.asset.uploadAsset({ workspaceId, kind: 'attachment', file: input.file })
          : undefined
      if (!asset) throw new Error('请选择要上传的附件')
      try {
        return await repositories.attachment.addAttachment({
          projectId,
          name: asset.originalName,
          targetType: 'asset',
          target: asset.storedUrl,
          assetId: asset.id,
        })
      } catch (error) {
        await repositories.asset.deleteAsset(asset.id).catch(() => undefined)
        throw error
      }
    },
    onSuccess: () => {
      setAttachmentMessage('')
      void queryClient.invalidateQueries({ queryKey: ['attachments', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['project', projectId] })
    },
    onError: (error) => setAttachmentMessage(error instanceof Error ? error.message : '附件上传失败'),
  })
  const selectPath = async (kind: 'file' | 'directory') => {
    const path = await window.deek?.selectPath({ kind, title: kind === 'file' ? '选择附件文件' : '选择附件目录' })
    if (!path) return
    addAttachmentMutation.mutate({ kind, path })
  }
  const selectManagedAttachment = async () => {
    if (source.kind !== 'local' || !repositories.asset.uploadAssetPath) {
      fileInputRef.current?.click()
      return
    }
    const filePath = await window.deek?.selectPath?.({ kind: 'file', title: '选择要托管到资料库的附件' })
    if (filePath) uploadAttachmentMutation.mutate({ filePath })
  }
  const checkAttachmentPaths = useCallback(async () => {
    const localAttachments = attachments.filter((item) => item.targetType !== 'asset')
    if (!window.deek?.statPath || localAttachments.length === 0) {
      setPathStats((current) => (Object.keys(current).length > 0 ? {} : current))
      return
    }
    const results = await Promise.all(localAttachments.map(async (item) => [item.id, await window.deek?.statPath?.(item.target)] as const))
    const nextStats = Object.fromEntries(results.filter(([, result]) => result).map(([id, result]) => [id, result as DeekPathStatResult]))
    setPathStats((current) => (arePathStatsEqual(current, nextStats) ? current : nextStats))
  }, [attachments])
  useEffect(() => {
    const timer = window.setTimeout(() => void checkAttachmentPaths(), 0)
    return () => window.clearTimeout(timer)
  }, [attachmentSignature, checkAttachmentPaths])
  const openAttachment = async (item: ProjectAttachment) => {
    if (item.targetType !== 'asset') {
      await window.deek?.openExternal(item.target)
      return
    }
    try {
      const url = await repositories.asset.resolveAssetUrl(item.target)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = item.name
      anchor.click()
    } catch (error) {
      setAttachmentMessage(error instanceof Error ? error.message : '附件读取失败')
    }
  }
  return (
    <div className={cn('flex flex-col', !compact && 'mt-6 rounded-lg border bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow-control)]')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-md border bg-background text-muted-foreground"><Archive size={17} /></span>
          <div>
            <h2 className="text-base font-semibold">附件</h2>
            <p className="text-sm text-muted-foreground">托管附件会复制到资料库存储；本机模式还可保留路径引用。</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) uploadAttachmentMutation.mutate({ file })
              event.target.value = ''
            }}
          />
          <Button size="sm" variant="outline" onClick={() => void checkAttachmentPaths()}><RefreshCw size={14} />刷新</Button>
          <Button size="sm" variant="outline" disabled={uploadAttachmentMutation.isPending} onClick={() => void selectManagedAttachment()}>
            <Paperclip size={14} />{uploadAttachmentMutation.isPending ? '上传中…' : '上传附件'}
          </Button>
          {source.kind === 'local' && <Button size="sm" variant="outline" onClick={() => void selectPath('file')}>本机文件引用</Button>}
          {source.kind === 'local' && <Button size="sm" variant="outline" onClick={() => void selectPath('directory')}>本机目录引用</Button>}
        </div>
      </div>
      {attachmentMessage && <p className="mt-3 text-sm text-destructive">{attachmentMessage}</p>}
      <m.div layout className="mt-4 overflow-hidden rounded-lg border bg-background">
        <AnimatePresence initial={false}>
        {attachments.map((item) => {
          const stat = pathStats[item.id]
          const missing = stat && !stat.exists
          return (
            <m.div
              layout
              key={item.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16, ease: standardEase }}
              className={cn('grid grid-cols-[64px_76px_minmax(0,1fr)_auto_auto_auto] items-center gap-2 border-b p-3 text-sm last:border-b-0', missing && 'bg-destructive/5')}
            >
              <Badge variant="outline">{item.targetType === 'asset' ? '托管' : item.targetType === 'file' ? '文件' : '目录'}</Badge>
              <Badge variant={missing ? 'destructive' : 'outline'}>{item.targetType === 'asset' ? '已保存' : stat ? (stat.exists ? '可用' : '缺失') : '未检查'}</Badge>
              <span className="truncate text-muted-foreground" title={item.target}>{item.target}</span>
              <Button size="sm" variant="outline" disabled={Boolean(missing)} onClick={() => void openAttachment(item)}>{item.targetType === 'asset' ? '下载' : '打开'}</Button>
              <Button size="sm" variant="outline" className={item.targetType === 'asset' ? 'invisible' : ''} disabled={Boolean(missing) || item.targetType === 'asset'} onClick={() => void window.deek?.showInFolder?.(item.target)}>定位</Button>
              <Button size="sm" variant="ghost" onClick={() => removeAttachmentMutation.mutate(item)}>移除</Button>
            </m.div>
          )
        })}
        {attachments.length === 0 && <m.div {...pageMotion} className="m-4 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">暂无附件。可以上传到资料库，或在本机模式添加路径引用。</m.div>}
        </AnimatePresence>
      </m.div>
    </div>
  )
}

function getPathName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
}

function openExternalTarget(target: string) {
  if (window.deek?.openExternal) {
    void window.deek.openExternal(target)
    return
  }
  window.open(target, '_blank', 'noopener,noreferrer')
}

function buildPageTree(groups: KnowledgeGroup[]) {
  const pages = groups.flatMap((group) => group.entries.map((entry) => ({ ...entry, groupId: group.id, children: [] as TreeKnowledgePage[] })))
  const pageById = new Map(pages.map((page) => [page.id, page]))
  const roots: TreeKnowledgePage[] = []

  for (const page of pages) {
    const parent = page.parentEntryId ? pageById.get(page.parentEntryId) : undefined
    if (parent && parent.id !== page.id) {
      parent.children.push(page)
    } else {
      roots.push(page)
    }
  }

  return roots
}

function filterGroupsBySearch(groups: KnowledgeGroup[], entrySearchIndex: Map<string, string>, normalizedSearch: string) {
  if (!normalizedSearch) return groups

  const allEntries = groups.flatMap((group) => group.entries)
  const entryById = new Map(allEntries.map((entry) => [entry.id, entry]))
  const childrenByParentId = new Map<string, KnowledgeEntrySummary[]>()
  for (const entry of allEntries) {
    if (!entry.parentEntryId) continue
    const children = childrenByParentId.get(entry.parentEntryId) ?? []
    children.push(entry)
    childrenByParentId.set(entry.parentEntryId, children)
  }

  const visibleEntryIds = new Set<string>()
  const includeAncestors = (entry: KnowledgeEntrySummary) => {
    let current: KnowledgeEntrySummary | undefined = entry
    while (current && !visibleEntryIds.has(current.id)) {
      visibleEntryIds.add(current.id)
      current = current.parentEntryId ? entryById.get(current.parentEntryId) : undefined
    }
  }
  const includeDescendants = (entry: KnowledgeEntrySummary) => {
    visibleEntryIds.add(entry.id)
    for (const child of childrenByParentId.get(entry.id) ?? []) includeDescendants(child)
  }

  for (const entry of allEntries) {
    const indexedText = entrySearchIndex.get(entry.id)
    const matchesSearch = entry.title.toLocaleLowerCase().includes(normalizedSearch) || Boolean(indexedText?.includes(normalizedSearch))
    if (!matchesSearch) continue
    includeAncestors(entry)
    includeDescendants(entry)
  }

  return groups
    .map((group) => ({
      ...group,
      entries: group.entries.filter((entry) => visibleEntryIds.has(entry.id)),
    }))
    .filter((group) => group.entries.length > 0)
}

function findPageById(pages: TreeKnowledgePage[], pageId: string): TreeKnowledgePage | undefined {
  for (const page of pages) {
    if (page.id === pageId) return page
    const child = findPageById(page.children, pageId)
    if (child) return child
  }
  return undefined
}

function collectPageDescendantIdsFromGroups(groups: KnowledgeGroup[], rootEntryId: string) {
  const childrenByParentId = new Map<string, KnowledgeEntrySummary[]>()
  for (const entry of groups.flatMap((group) => group.entries)) {
    if (!entry.parentEntryId) continue
    const children = childrenByParentId.get(entry.parentEntryId) ?? []
    children.push(entry)
    childrenByParentId.set(entry.parentEntryId, children)
  }

  const result = new Set<string>()
  const visit = (entryId: string) => {
    result.add(entryId)
    for (const child of childrenByParentId.get(entryId) ?? []) visit(child.id)
  }
  visit(rootEntryId)
  return result
}

function formatLocalDateTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function arePathStatsEqual(current: Record<string, DeekPathStatResult>, next: Record<string, DeekPathStatResult>) {
  const currentKeys = Object.keys(current)
  const nextKeys = Object.keys(next)
  if (currentKeys.length !== nextKeys.length) return false
  return nextKeys.every((key) => {
    const currentItem = current[key]
    const nextItem = next[key]
    return (
      currentItem?.ok === nextItem?.ok &&
      currentItem?.exists === nextItem?.exists &&
      currentItem?.kind === nextItem?.kind &&
      currentItem?.updatedAt === nextItem?.updatedAt &&
      currentItem?.error === nextItem?.error
    )
  })
}

function ProjectSettingsPanel({ project }: { project: { id: string; name: string; description: string; tag: string; tone: ProjectTone; entryCount: number } }) {
  const repositories = useRepositories()
  const queryClient = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)
  const [values, setValues] = useState({ name: project.name, description: project.description, tag: project.tag, tone: project.tone })
  const updateProjectMutation = useMutation({
    mutationFn: () =>
      repositories.project.updateProject({
        id: project.id,
        name: values.name.trim() || project.name,
        description: values.description.trim(),
        tag: values.tag.trim() || project.tag,
        tone: values.tone,
      }),
    onSuccess: () => {
      setEditOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['project', project.id] })
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
  return (
    <Card className="min-h-[calc(100dvh-7rem)] p-5">
      <div className="flex items-center justify-between border-b pb-4">
        <h1 className="text-lg font-semibold">项目设置</h1>
        <Button variant="outline" onClick={() => { setValues({ name: project.name, description: project.description, tag: project.tag, tone: project.tone }); setEditOpen(true) }}>
          <Pencil size={15} />
          编辑
        </Button>
      </div>
      <div className="mt-5 grid max-w-3xl gap-3 text-sm">
        <InfoRow label="项目名称" value={project.name} />
        <InfoRow label="项目说明" value={project.description || '-'} />
        <InfoRow label="标签" value={project.tag} />
        <InfoRow label="资料数量" value={`${project.entryCount} 条`} />
      </div>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              updateProjectMutation.mutate()
            }}
          >
            <DialogHeader>
              <DialogTitle>编辑项目设置</DialogTitle>
              <DialogDescription>这些信息会同步到项目列表和顶部标签。</DialogDescription>
            </DialogHeader>
            <div className="mt-5 grid gap-4">
              <TextInput label="项目名称" value={values.name} onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))} />
              <label className="grid gap-2">
                <Label>项目说明</Label>
                <Textarea value={values.description} onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))} />
              </label>
              <TextInput label="标签" value={values.tag} onChange={(event) => setValues((current) => ({ ...current, tag: event.target.value }))} />
            </div>
            <DialogFooter className="mt-6">
              <DialogClose asChild><Button type="button" variant="outline">取消</Button></DialogClose>
              <Button type="submit" disabled={!values.name.trim() || updateProjectMutation.isPending}>保存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-3 rounded-md border bg-background px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-foreground">{value}</span>
    </div>
  )
}

function EditableTextEntry(props: {
  entry: KnowledgeEntryDetail
  projectId: string
  workspaceId: string
  setKnowledgeGroupsCache: (updater: (current: KnowledgeGroup[]) => KnowledgeGroup[]) => void
  childPages: TreeKnowledgePage[]
  onOpenPage: (entryId: string) => void
  onCreateChildPage: () => void
  onDelete: () => void
  onOpenIconPicker: (entry: KnowledgeEntrySummary, event: MouseEvent<HTMLElement>) => void
}) {
  const repositories = useRepositories()
  const queryClient = useQueryClient()
  const [draftTitle, setDraftTitle] = useState(props.entry.title)
  const [draftRemark, setDraftRemark] = useState(props.entry.remark)
  const [draftContent, setDraftContent] = useState(() => normalizeKnowledgeContent(props.entry.textContent ?? ''))
  const [saveMessage, setSaveMessage] = useState('')
  const mountedRef = useRef(true)
  const saveChainRef = useRef(Promise.resolve())
  const lastQueuedSignatureRef = useRef(JSON.stringify({ id: props.entry.id, title: draftTitle, remark: draftRemark, textContent: draftContent }))
  const latestDraftRef = useRef({ title: draftTitle, remark: draftRemark, textContent: draftContent })
  const entryId = props.entry.id
  const projectId = props.projectId
  const setKnowledgeGroupsCache = props.setKnowledgeGroupsCache

  useEffect(() => {
    latestDraftRef.current = { title: draftTitle, remark: draftRemark, textContent: draftContent }
  }, [draftContent, draftRemark, draftTitle])

  const persistLatestDraft = useCallback(() => {
    const input = { id: entryId, ...latestDraftRef.current }
    const signature = JSON.stringify(input)
    if (signature === lastQueuedSignatureRef.current) return
    lastQueuedSignatureRef.current = signature
    if (mountedRef.current) setSaveMessage('保存中')
    saveChainRef.current = saveChainRef.current
      .catch(() => undefined)
      .then(() => repositories.knowledge.updateEntry({
        id: input.id,
        title: input.title.trim() || '新页面',
        remark: input.remark.trim(),
        textContent: input.textContent,
      }))
      .then((updatedEntry) => {
        if (!updatedEntry) return
        queryClient.setQueryData(['entry', projectId, updatedEntry.id], updatedEntry)
        setKnowledgeGroupsCache((current) =>
          current.map((group) => ({
            ...group,
            entries: group.entries.map((item) => (item.id === updatedEntry.id ? { id: updatedEntry.id, title: updatedEntry.title, type: updatedEntry.type, icon: updatedEntry.icon, parentEntryId: updatedEntry.parentEntryId } : item)),
          })),
        )
        if (mountedRef.current && signature === lastQueuedSignatureRef.current) {
          setSaveMessage('已保存')
          window.setTimeout(() => mountedRef.current && setSaveMessage(''), 1200)
        }
      })
      .catch((error) => {
        if (mountedRef.current) setSaveMessage(error instanceof Error ? `保存失败：${error.message}` : '保存失败，请重试')
      })
  }, [entryId, projectId, queryClient, repositories.knowledge, setKnowledgeGroupsCache])

  useEffect(() => {
    if (draftTitle === props.entry.title && draftRemark === props.entry.remark && draftContent === normalizeKnowledgeContent(props.entry.textContent ?? '')) return
    const timer = window.setTimeout(persistLatestDraft, 650)
    return () => window.clearTimeout(timer)
  }, [draftContent, draftRemark, draftTitle, persistLatestDraft, props.entry.remark, props.entry.textContent, props.entry.title])

  useEffect(() => () => {
    mountedRef.current = false
    persistLatestDraft()
  }, [persistLatestDraft])

  return (
    <EditableDocument
      projectId={props.projectId}
      workspaceId={props.workspaceId}
      entry={props.entry}
      title={draftTitle}
      remark={draftRemark}
      content={draftContent}
      saveMessage={saveMessage}
      onTitleChange={setDraftTitle}
      onRemarkChange={setDraftRemark}
      onContentChange={setDraftContent}
      childPages={props.childPages}
      onOpenPage={props.onOpenPage}
      onCreateChildPage={props.onCreateChildPage}
      onDelete={props.onDelete}
      onOpenIconPicker={props.onOpenIconPicker}
    />
  )
}

function EditableDocument(props: {
  projectId: string
  workspaceId: string
  entry: KnowledgeEntryDetail
  title: string
  remark: string
  content: string
  saveMessage: string
  childPages: TreeKnowledgePage[]
  onTitleChange: (value: string) => void
  onRemarkChange: (value: string) => void
  onContentChange: (value: string) => void
  onOpenPage: (entryId: string) => void
  onCreateChildPage: () => void
  onDelete: () => void
  onOpenIconPicker: (entry: KnowledgeEntrySummary, event: MouseEvent<HTMLElement>) => void
}) {
  const [utilityPanel, setUtilityPanel] = useState<'children' | 'attachments' | null>(null)
  const [editorMode, setEditorMode] = useState<EditorMode>('visual')
  const toggleUtilityPanel = (panel: 'children' | 'attachments') => {
    setUtilityPanel((current) => (current === panel ? null : panel))
  }
  const editorModeButton = (targetMode: EditorMode, label: string, icon: ReactNode) => (
    <button
      type="button"
      data-active={editorMode === targetMode}
      className={cn(
        'deek-segmented-item inline-flex h-8 items-center gap-1.5 px-2.5 text-[length:var(--text-caption)] font-medium transition',
        editorMode !== targetMode && 'text-muted-foreground hover:text-foreground',
      )}
      onClick={() => setEditorMode(targetMode)}
    >
      {icon}
      {label}
    </button>
  )

  return (
    <article className="deek-knowledge-doc min-h-[calc(100dvh-7rem)] w-full pb-16">
      <div className="deek-knowledge-doc-toolbar sticky top-0 z-20 -mx-2 px-2 py-2.5">
        <div className="relative flex items-center justify-between gap-3">
          <div className="min-w-0 text-[length:var(--text-callout)] text-muted-foreground">
            {props.saveMessage || ' '}
          </div>
          <div className="flex items-center gap-2">
            <div className="deek-segmented inline-flex items-center gap-0.5">
              {editorModeButton('visual', '富文本', <FileText size={14} strokeWidth={1.75} />)}
              {editorModeButton('source', '源码', <FileCode2 size={14} strokeWidth={1.75} />)}
              {editorModeButton('code', '代码', <Code2 size={14} strokeWidth={1.75} />)}
            </div>
            <Button size="sm" variant={utilityPanel === 'children' ? 'secondary' : 'ghost'} onClick={() => toggleUtilityPanel('children')}>
              <FileText size={15} strokeWidth={1.75} />
              子页面 {props.childPages.length}
            </Button>
            <Button size="sm" variant={utilityPanel === 'attachments' ? 'secondary' : 'ghost'} onClick={() => toggleUtilityPanel('attachments')}>
              <Paperclip size={15} strokeWidth={1.75} />
              附件
            </Button>
            <Button size="icon" variant="ghost" aria-label="删除页面" onClick={props.onDelete}>
              <Trash2 size={16} strokeWidth={1.75} />
            </Button>
          </div>
          <AnimatePresence>
            {utilityPanel && (
              <m.div
                key={utilityPanel}
                initial={{ opacity: 0, y: -4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={{ duration: 0.14, ease: standardEase }}
                className="absolute right-0 top-[calc(100%+0.5rem)] z-30 max-h-[min(34rem,72dvh)] w-[min(44rem,calc(100vw-22rem))] overflow-auto rounded-[var(--radius-dialog)] border border-[var(--card-border)] bg-[var(--dialog-bg)] p-4 shadow-[var(--shadow-popover)]"
              >
                {utilityPanel === 'children' ? (
                  <ChildPagesPanel childPages={props.childPages} onOpenPage={props.onOpenPage} onCreateChildPage={props.onCreateChildPage} />
                ) : (
                  <ProjectFilesPanel projectId={props.projectId} workspaceId={props.workspaceId} compact />
                )}
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <div className="mt-12 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
        <button
          type="button"
          className="grid h-12 w-12 shrink-0 place-items-center rounded-[var(--radius-control)] border border-transparent text-3xl leading-none transition hover:border-[var(--glass-border)] hover:bg-[var(--glass-bg)] hover:shadow-[var(--shadow-control)]"
          title="更换页面图标"
          aria-label="更换页面图标"
          onClick={(event) => props.onOpenIconPicker(props.entry, event)}
        >
          {props.entry.icon ? props.entry.icon : <Smile size={28} className="text-muted-foreground/55" />}
        </button>
        <input
          className="deek-page-title-input w-full min-w-0 border-0 bg-transparent text-foreground outline-none placeholder:text-muted-foreground/35"
          value={props.title}
          onChange={(event) => props.onTitleChange(event.target.value)}
          placeholder="新页面"
        />
      </div>
      <input
        className="deek-page-subtitle-input mt-3 w-full border-0 bg-transparent text-foreground outline-none placeholder:text-muted-foreground/45"
        value={props.remark}
        onChange={(event) => props.onRemarkChange(event.target.value)}
        placeholder="添加一句备注..."
      />
      {props.childPages.length > 0 && (
        <div className="mt-8">
          <ChildPageLinks childPages={props.childPages} onOpenPage={props.onOpenPage} />
        </div>
      )}
      <div className="mt-7">
        <RichTextEditor workspaceId={props.workspaceId} value={props.content} onChange={props.onContentChange} mode={editorMode} spacious />
      </div>
    </article>
  )
}

function ChildPagesPanel(props: { childPages: TreeKnowledgePage[]; onOpenPage: (entryId: string) => void; onCreateChildPage: () => void }) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">子页面</h2>
          <p className="text-sm text-muted-foreground">页面可以继续作为目录使用。</p>
        </div>
        <Button size="sm" variant="outline" onClick={props.onCreateChildPage}>
          <Plus size={14} />
          新建
        </Button>
      </div>
      {props.childPages.length > 0 ? (
        <ChildPageLinks childPages={props.childPages} onOpenPage={props.onOpenPage} framed />
      ) : (
        <div className="rounded-lg border bg-background p-5 text-sm text-muted-foreground">暂无子页面。</div>
      )}
    </div>
  )
}

function ChildPageLinks(props: { childPages: TreeKnowledgePage[]; onOpenPage: (entryId: string) => void; framed?: boolean }) {
  return (
    <div className={cn('grid gap-1.5', props.framed && 'overflow-hidden rounded-lg border bg-background p-1')}>
      {props.childPages.map((page) => (
        <button
          key={page.id}
          type="button"
          className={cn(
            'group grid min-h-10 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-medium text-foreground transition hover:bg-muted/70 hover:text-foreground',
            props.framed && 'rounded-md',
          )}
          onClick={() => props.onOpenPage(page.id)}
        >
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-base leading-none text-muted-foreground group-hover:bg-background/70 group-hover:text-foreground">
            {page.icon ? page.icon : <FileText size={15} />}
          </span>
          <span className="min-w-0 truncate">{page.title || '新页面'}</span>
          {page.children.length > 0 && <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{page.children.length}</span>}
        </button>
      ))}
    </div>
  )
}

function LegacyEntryHeader({ entry, onEdit, onDelete }: { entry: { title: string; remark: string; type: EntryType; tags: string[]; createdAt: string; updatedAt: string }; onEdit: () => void; onDelete: () => void }) {
  return (
    <header className="sticky top-0 z-10 mb-5 border-b bg-[#f4f5f7]/95 pb-5 pt-1 backdrop-blur">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="bg-[var(--surface-elevated)]">{entryTypeText[entry.type]}</Badge>
            {entry.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}
          </div>
          <h1 className="mt-3 truncate text-2xl font-semibold tracking-normal text-foreground">{entry.title}</h1>
          {entry.remark && <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{entry.remark}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>创建 {formatLocalDateTime(entry.createdAt)}</span>
            <span className="h-3 w-px bg-border" />
            <span>更新 {formatLocalDateTime(entry.updatedAt)}</span>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" className="bg-[var(--surface-elevated)]" onClick={onEdit}><Pencil size={15} />编辑</Button>
          <Button size="icon" variant="ghost" aria-label="删除条目" onClick={onDelete}><Trash2 size={16} /></Button>
        </div>
      </div>
    </header>
  )
}

function RichTextEditor({ workspaceId, value, onChange, mode, spacious = false }: { workspaceId: string; value: string; onChange: (value: string) => void; mode: EditorMode; spacious?: boolean }) {
  const repositories = useRepositories()
  const [initialDocument] = useState(() => parseKnowledgeContent(value))
  const initializingRef = useRef(true)
  const sourceUpdateTimerRef = useRef<number | null>(null)
  const latestMarkdownRef = useRef(initialDocument.markdown)
  const [sourceDraft, setSourceDraft] = useState(() => initialDocument.markdown)
  const [codeDraft, setCodeDraft] = useState(() => markdownToEditableCode(initialDocument.markdown))
  const displayToStoredAssetUrlRef = useRef(new Map<string, string>())
  const editor = useCreateBlockNote({
    dictionary: zh,
    schema: blockNoteSchema,
    initialContent: initialDocument.blocks,
    uploadFile: async (file) => {
      const asset = await repositories.asset.uploadAsset({ workspaceId, kind: 'image', file })
      const displayUrl = await repositories.asset.resolveAssetUrl(asset.storedUrl)
      displayToStoredAssetUrlRef.current.set(displayUrl, asset.storedUrl)
      return displayUrl
    },
    pasteHandler: ({ defaultPasteHandler }) => defaultPasteHandler({ prioritizeMarkdownOverHTML: false }),
  })

  useEffect(() => {
    let cancelled = false
    const loadInitialContent = async () => {
      const parsedBlocks = initialDocument.source === 'markdown'
        ? await editor.tryParseMarkdownToBlocks(initialDocument.markdown)
        : initialDocument.blocks
      const blocks = await hydrateManagedAssetReferences(ensureBlocks(parsedBlocks), repositories.asset.resolveAssetUrl, displayToStoredAssetUrlRef.current)
      if (cancelled) return
      editor.replaceBlocks(editor.document, ensureBlocks(blocks))
      const markdown = await editor.blocksToMarkdownLossy(editor.document)
      if (cancelled) return
      latestMarkdownRef.current = markdown
      setSourceDraft(markdown)
      setCodeDraft(markdownToEditableCode(markdown))
      window.setTimeout(() => {
        initializingRef.current = false
      }, 0)
    }
    void loadInitialContent()
    return () => {
      cancelled = true
      if (sourceUpdateTimerRef.current) window.clearTimeout(sourceUpdateTimerRef.current)
    }
  }, [editor, initialDocument, repositories.asset])

  useEditorChange(async (currentEditor) => {
    if (initializingRef.current) return
    const markdown = await currentEditor.blocksToMarkdownLossy(currentEditor.document)
    latestMarkdownRef.current = markdown
    if (mode !== 'source') setSourceDraft(markdown)
    if (mode !== 'code') setCodeDraft(markdownToEditableCode(markdown))
    onChange(serializeBlockNoteContent(restoreManagedAssetReferences(currentEditor.document, displayToStoredAssetUrlRef.current)))
  }, editor)

  useEffect(() => {
    if (mode === 'source') setSourceDraft(latestMarkdownRef.current)
    if (mode === 'code') setCodeDraft(markdownToEditableCode(latestMarkdownRef.current))
  }, [mode])

  const updateSource = (nextValue: string) => {
    setSourceDraft(nextValue)
    latestMarkdownRef.current = nextValue
    if (sourceUpdateTimerRef.current) window.clearTimeout(sourceUpdateTimerRef.current)
    sourceUpdateTimerRef.current = window.setTimeout(async () => {
      const blocks = await editor.tryParseMarkdownToBlocks(nextValue)
      editor.replaceBlocks(editor.document, ensureBlocks(blocks))
      onChange(serializeBlockNoteContent(restoreManagedAssetReferences(ensureBlocks(blocks), displayToStoredAssetUrlRef.current)))
    }, 250)
  }

  const updateCode = (nextValue: string) => {
    setCodeDraft(nextValue)
    updateSource(codeTextToMarkdown(nextValue))
  }

  const openLinkInSystemBrowser = (event: MouseEvent<HTMLDivElement>) => {
    if (mode !== 'visual') return
    if (!(event.target instanceof Element)) return
    const link = event.target.closest('a[href]')
    const href = link?.getAttribute('href')
    if (!href) return
    event.preventDefault()
    event.stopPropagation()
    openExternalTarget(href)
  }

  return (
    <div className="relative bg-transparent">
      <div
        className={cn(
          mode !== 'visual' && 'hidden',
          'deek-blocknote-editor bg-transparent',
          spacious ? 'min-h-[min(42rem,58dvh)]' : 'min-h-64',
        )}
        onClick={openLinkInSystemBrowser}
      >
        <BlockNoteView editor={editor} theme="light" />
      </div>
      {mode === 'source' && (
        <textarea
          className={cn(
            'w-full resize-y rounded-lg border-0 bg-slate-950 p-5 font-mono text-sm leading-7 text-slate-100 outline-none',
            spacious ? 'min-h-[max(38rem,calc(100dvh-19rem))]' : 'min-h-64',
          )}
          spellCheck={false}
          value={sourceDraft}
          onChange={(event) => updateSource(event.target.value)}
        />
      )}
      {mode === 'code' && (
        <textarea
          className={cn(
            'w-full resize-y rounded-lg border-0 bg-slate-950 p-5 font-mono text-sm leading-7 text-slate-100 outline-none',
            spacious ? 'min-h-[max(38rem,calc(100dvh-19rem))]' : 'min-h-64',
          )}
          spellCheck={false}
          value={codeDraft}
          onChange={(event) => updateCode(event.target.value)}
        />
      )}
    </div>
  )
}

const blockNoteContentFormat = 'blocknote-json'

type ParsedKnowledgeContent = {
  source: 'blocknote' | 'markdown'
  blocks: PartialBlock[]
  markdown: string
}

function emptyBlockNoteBlocks(): PartialBlock[] {
  return [{ type: 'paragraph', content: '' }]
}

function ensureBlocks(blocks: PartialBlock[]) {
  return blocks.length > 0 ? blocks : emptyBlockNoteBlocks()
}

async function hydrateManagedAssetReferences(
  blocks: PartialBlock[],
  resolveAssetUrl: (storedUrl: string) => Promise<string>,
  displayToStored: Map<string, string>,
): Promise<PartialBlock[]> {
  const visit = async (value: unknown): Promise<unknown> => {
    if (typeof value === 'string' && value.startsWith('deek-asset://service/')) {
      const displayUrl = await resolveAssetUrl(value)
      displayToStored.set(displayUrl, value)
      return displayUrl
    }
    if (Array.isArray(value)) return Promise.all(value.map(visit))
    if (value && typeof value === 'object') {
      const entries = await Promise.all(Object.entries(value).map(async ([key, child]) => [key, await visit(child)] as const))
      return Object.fromEntries(entries)
    }
    return value
  }
  return await visit(blocks) as PartialBlock[]
}

function restoreManagedAssetReferences(blocks: unknown, displayToStored: Map<string, string>): PartialBlock[] {
  const visit = (value: unknown): unknown => {
    if (typeof value === 'string') return displayToStored.get(value) ?? value
    if (Array.isArray(value)) return value.map(visit)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, visit(child)]))
    return value
  }
  return visit(blocks) as PartialBlock[]
}

function serializeBlockNoteContent(blocks: unknown[]) {
  return JSON.stringify({
    format: blockNoteContentFormat,
    version: 1,
    blocks,
  })
}

function normalizeKnowledgeContent(value: string) {
  const parsed = tryParseBlockNoteContent(value)
  if (parsed) return serializeBlockNoteContent(parsed)
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (!looksLikeJsonDocument(trimmed)) return value
  return tiptapJsonToMarkdown(parseTiptapContent(value)).trim()
}

function parseKnowledgeContent(value: string): ParsedKnowledgeContent {
  const storedBlocks = tryParseBlockNoteContent(value)
  if (storedBlocks) {
    return { source: 'blocknote', blocks: ensureBlocks(storedBlocks), markdown: '' }
  }
  const markdown = normalizeKnowledgeContent(value)
  return { source: 'markdown', blocks: emptyBlockNoteBlocks(), markdown }
}

function tryParseBlockNoteContent(value: string): PartialBlock[] | null {
  const trimmed = value.trim()
  if (!trimmed || !trimmed.startsWith('{')) return null
  try {
    const parsed = JSON.parse(trimmed) as { format?: unknown; blocks?: unknown }
    if (parsed.format !== blockNoteContentFormat || !Array.isArray(parsed.blocks)) return null
    return parsed.blocks as PartialBlock[]
  } catch {
    return null
  }
}

function looksLikeJsonDocument(value: string) {
  return value.startsWith('{') && value.includes('"type"') && value.includes('"doc"')
}

function parseTiptapContent(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return emptyTiptapDocument()
  try {
    const parsed = JSON.parse(trimmed)
    if (parsed?.type === 'doc') return parsed
  } catch {
    // Fall through to plain text conversion.
  }
  return textToTiptapDocument(value)
}

function emptyTiptapDocument() {
  return { type: 'doc', content: [{ type: 'paragraph' }] }
}

function textToTiptapDocument(value: string) {
  const lines = value.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>\s*<p>/gi, '\n').replace(/<[^>]+>/g, '').split(/\n+/)
  const content = lines.map((line) => line.trim()).filter(Boolean).map((line) => ({
    type: 'paragraph',
    content: [{ type: 'text', text: line }],
  }))
  return { type: 'doc', content: content.length > 0 ? content : [{ type: 'paragraph' }] }
}

function codeTextToMarkdown(value: string) {
  return `\`\`\`\n${value.replace(/```/g, '\\`\\`\\`')}\n\`\`\``
}

function markdownToEditableCode(value: string) {
  const match = value.trim().match(/^```[^\n]*\n([\s\S]*?)\n```$/)
  return match?.[1] ?? value
}

function tiptapJsonToMarkdown(document: { content?: unknown[] }) {
  return document.content?.map((node) => tiptapNodeToMarkdown(node as TiptapJsonNode, 0)).filter(Boolean).join('\n\n') ?? ''
}

type TiptapJsonNode = {
  type?: string
  text?: string
  attrs?: Record<string, unknown>
  marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>
  content?: TiptapJsonNode[]
}

function tiptapNodeToMarkdown(node: TiptapJsonNode, depth: number): string {
  if (node.type === 'paragraph') return tiptapInlineToMarkdown(node.content)
  if (node.type === 'heading') return `${'#'.repeat(Number(node.attrs?.level ?? 1))} ${tiptapInlineToMarkdown(node.content)}`
  if (node.type === 'blockquote') return tiptapInlineToMarkdown(node.content).split('\n').map((line) => `> ${line}`).join('\n')
  if (node.type === 'codeBlock') return `\`\`\`${typeof node.attrs?.language === 'string' ? node.attrs.language : ''}\n${tiptapInlineToMarkdown(node.content)}\n\`\`\``
  if (node.type === 'bulletList') return node.content?.map((child) => `${'  '.repeat(depth)}- ${tiptapNodeToMarkdown(child, depth + 1)}`).join('\n') ?? ''
  if (node.type === 'orderedList') return node.content?.map((child, index) => `${'  '.repeat(depth)}${index + 1}. ${tiptapNodeToMarkdown(child, depth + 1)}`).join('\n') ?? ''
  if (node.type === 'listItem') return node.content?.map((child) => tiptapNodeToMarkdown(child, depth)).join('\n') ?? ''
  if (node.type === 'imageBlock') return `![${String(node.attrs?.alt ?? '')}](${String(node.attrs?.src ?? '')})`
  if (node.type === 'table') return tiptapTableToMarkdown(node)
  return node.content?.map((child) => tiptapNodeToMarkdown(child, depth)).filter(Boolean).join('\n\n') ?? ''
}

function tiptapInlineToMarkdown(content: TiptapJsonNode[] = []) {
  return content.map((node) => {
    if (node.text) {
      let text = node.text
      for (const mark of node.marks ?? []) {
        if (mark.type === 'bold') text = `**${text}**`
        if (mark.type === 'italic') text = `*${text}*`
        if (mark.type === 'code') text = `\`${text}\``
        if (mark.type === 'link') text = `[${text}](${String(mark.attrs?.href ?? '')})`
      }
      return text
    }
    return tiptapNodeToMarkdown(node, 0)
  }).join('')
}

function tiptapTableToMarkdown(node: TiptapJsonNode) {
  const rows = node.content?.map((row) => row.content?.map((cell) => tiptapInlineToMarkdown(cell.content)).join(' | ') ?? '') ?? []
  if (rows.length === 0) return ''
  const columnCount = Math.max(...rows.map((row) => row.split(' | ').length))
  const separator = Array.from({ length: columnCount }, () => '---').join(' | ')
  return [`| ${rows[0]} |`, `| ${separator} |`, ...rows.slice(1).map((row) => `| ${row} |`)].join('\n')
}

function PasswordItemsEditor({ items, onChange }: { items: PasswordEntryItem[]; onChange: (items: PasswordEntryItem[]) => void }) {
  const updateItem = (id: string, patch: Partial<PasswordEntryItem>) => onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  return (
    <div className="grid gap-3">
      <Label>账号字段</Label>
      {items.map((item) => (
        <div key={item.id} className="grid grid-cols-2 gap-2">
          <TextInput value={item.name} onChange={(event) => updateItem(item.id, { name: event.target.value })} placeholder="名称" />
          <TextInput value={item.valuePreview} onChange={(event) => updateItem(item.id, { valuePreview: event.target.value })} placeholder="值" />
        </div>
      ))}
      <Button type="button" variant="outline" onClick={() => onChange([...items, { id: crypto.randomUUID(), name: '字段', valuePreview: '' }])}><Plus size={15} />添加字段</Button>
    </div>
  )
}

function LinkItemsEditor({ items, onChange }: { items: LinkEntryItem[]; onChange: (items: LinkEntryItem[]) => void }) {
  const updateItem = (id: string, patch: Partial<LinkEntryItem>) => onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  return (
    <div className="grid gap-3">
      <Label>链接字段</Label>
      {items.map((item) => (
        <div key={item.id} className="grid grid-cols-[1fr_112px_1.5fr] gap-2">
          <TextInput value={item.name} onChange={(event) => updateItem(item.id, { name: event.target.value })} placeholder="名称" />
          <Select value={item.targetType} onValueChange={(value) => updateItem(item.id, { targetType: value as LinkTargetType })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="url">网址</SelectItem>
              <SelectItem value="file">文件</SelectItem>
              <SelectItem value="folder">目录</SelectItem>
            </SelectContent>
          </Select>
          <TextInput value={item.target} onChange={(event) => updateItem(item.id, { target: event.target.value })} placeholder="路径或网址" />
        </div>
      ))}
      <Button type="button" variant="outline" onClick={() => onChange([...items, { id: crypto.randomUUID(), name: '链接', targetType: 'url', target: '' }])}><Plus size={15} />添加链接</Button>
    </div>
  )
}

function EntryDialogs(props: {
  workspaceId: string
  editOpen: boolean
  setEditOpen: (open: boolean) => void
  editValues: { title: string; remark: string; textContent: string; passwordItems: PasswordEntryItem[]; linkItems: LinkEntryItem[] }
  setEditValues: (values: { title: string; remark: string; textContent: string; passwordItems: PasswordEntryItem[]; linkItems: LinkEntryItem[] }) => void
  updateEntryMutation: ReturnType<typeof useMutation<unknown, Error, void>>
  deleteOpen: boolean
  setDeleteOpen: (open: boolean) => void
  deleteEntryMutation: ReturnType<typeof useMutation<unknown, Error, void>>
  entryType?: EntryType
}) {
  const [dialogEditorMode] = useState<EditorMode>('visual')

  return (
    <>
      <Dialog open={props.editOpen} onOpenChange={props.setEditOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-hidden sm:max-w-lg">
          <form
            className="flex min-h-0 max-h-[calc(100dvh-4rem)] flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              props.updateEntryMutation.mutate()
            }}
          >
            <DialogHeader>
              <DialogTitle>编辑页面</DialogTitle>
              <DialogDescription>保存后会同步更新左侧页面树。</DialogDescription>
            </DialogHeader>
            <div className="mt-5 grid min-h-0 gap-4 overflow-y-auto pr-1">
              <TextInput label="标题" value={props.editValues.title} onChange={(event) => props.setEditValues({ ...props.editValues, title: event.target.value })} />
              <label className="grid gap-2">
                <Label>备注</Label>
                <Textarea value={props.editValues.remark} onChange={(event) => props.setEditValues({ ...props.editValues, remark: event.target.value })} />
              </label>
              {props.entryType === 'text' && (
                <label className="grid gap-2">
                  <Label>正文</Label>
                  <RichTextEditor workspaceId={props.workspaceId} value={props.editValues.textContent} onChange={(textContent) => props.setEditValues({ ...props.editValues, textContent })} mode={dialogEditorMode} />
                </label>
              )}
              {props.entryType === 'password' && <PasswordItemsEditor items={props.editValues.passwordItems} onChange={(passwordItems) => props.setEditValues({ ...props.editValues, passwordItems })} />}
              {props.entryType === 'link' && <LinkItemsEditor items={props.editValues.linkItems} onChange={(linkItems) => props.setEditValues({ ...props.editValues, linkItems })} />}
            </div>
            <DialogFooter className="mt-6">
              <DialogClose asChild><Button type="button" variant="outline">取消</Button></DialogClose>
              <Button type="submit" disabled={!props.editValues.title.trim() || props.updateEntryMutation.isPending}>保存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={props.deleteOpen} onOpenChange={props.setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除页面</DialogTitle>
            <DialogDescription>确定删除当前页面吗？它的子页面也会一起删除。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">取消</Button></DialogClose>
            <Button variant="destructive" disabled={props.deleteEntryMutation.isPending} onClick={() => props.deleteEntryMutation.mutate()}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
