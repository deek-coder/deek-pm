import { create } from 'zustand'

export interface ProjectTab {
  workspaceId: string
  projectId: string
  title: string
}

interface WorkspaceTabsState {
  tabs: ProjectTab[]
  openProjectTab: (tab: ProjectTab) => void
  closeProjectTab: (workspaceId: string, projectId: string) => void
}

export const useWorkspaceTabs = create<WorkspaceTabsState>((set) => ({
  tabs: [],
  openProjectTab: (tab) =>
    set((state) => {
      const existingTab = state.tabs.find(
        (item) => item.workspaceId === tab.workspaceId && item.projectId === tab.projectId,
      )

      if (existingTab) {
        if (existingTab.title === tab.title) return state

        return {
          tabs: state.tabs.map((item) =>
            item.workspaceId === tab.workspaceId && item.projectId === tab.projectId ? tab : item,
          ),
        }
      }

      return { tabs: [...state.tabs, tab] }
    }),
  closeProjectTab: (workspaceId, projectId) =>
    set((state) => ({
      tabs: state.tabs.filter((item) => item.workspaceId !== workspaceId || item.projectId !== projectId),
    })),
}))
