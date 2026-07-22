import { createHashHistory, createRootRoute, createRoute, createRouter, lazyRouteComponent } from '@tanstack/react-router'
import { RootLayout } from './components/layout/RootLayout'

const workspacePage = <T extends 'LaunchPage' | 'ProjectsPage' | 'ProjectStatsPage' | 'QuickEntriesPage' | 'BackupPage' | 'SettingsPage' | 'WorkspaceLayout'>(name: T) =>
  lazyRouteComponent(() => import('./features/workspace/workspacePages'), name)

const rootRoute = createRootRoute({ component: RootLayout })
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: workspacePage('LaunchPage') })
const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workspace/$workspaceId',
  component: workspacePage('WorkspaceLayout'),
})
const projectsRoute = createRoute({ getParentRoute: () => workspaceRoute, path: '/', component: workspacePage('ProjectsPage') })
const projectStatsRoute = createRoute({ getParentRoute: () => workspaceRoute, path: '/stats', component: workspacePage('ProjectStatsPage') })
const quickEntriesRoute = createRoute({ getParentRoute: () => workspaceRoute, path: '/quick-entries', component: workspacePage('QuickEntriesPage') })
const backupRoute = createRoute({ getParentRoute: () => workspaceRoute, path: '/backup', component: workspacePage('BackupPage') })
const settingsRoute = createRoute({ getParentRoute: () => workspaceRoute, path: '/settings', component: workspacePage('SettingsPage') })
const knowledgeRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/project/$projectId',
  component: lazyRouteComponent(() => import('./features/knowledge/KnowledgeRoutePage'), 'KnowledgeRoutePage'),
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
