import { createHashHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { KnowledgeRoutePage } from './features/knowledge/KnowledgeRoutePage'
import {
  BackupPage,
  LaunchPage,
  ProjectsPage,
  ProjectStatsPage,
  QuickEntriesPage,
  RootLayout,
  SettingsPage,
  WorkspaceLayout,
} from './features/workspace/workspacePages'

const rootRoute = createRootRoute({ component: RootLayout })
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: LaunchPage })
const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workspace/$workspaceId',
  component: WorkspaceLayout,
})
const projectsRoute = createRoute({ getParentRoute: () => workspaceRoute, path: '/', component: ProjectsPage })
const projectStatsRoute = createRoute({ getParentRoute: () => workspaceRoute, path: '/stats', component: ProjectStatsPage })
const quickEntriesRoute = createRoute({ getParentRoute: () => workspaceRoute, path: '/quick-entries', component: QuickEntriesPage })
const backupRoute = createRoute({ getParentRoute: () => workspaceRoute, path: '/backup', component: BackupPage })
const settingsRoute = createRoute({ getParentRoute: () => workspaceRoute, path: '/settings', component: SettingsPage })
const knowledgeRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/project/$projectId',
  component: KnowledgeRoutePage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  workspaceRoute.addChildren([projectsRoute, projectStatsRoute, quickEntriesRoute, backupRoute, settingsRoute, knowledgeRoute]),
])

export const router = createRouter({ routeTree, history: createHashHistory() })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
