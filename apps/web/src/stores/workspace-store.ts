import { create } from 'zustand';

/**
 * Lightweight client-only workspace state.
 *
 * Server data belongs in TanStack Query; this store is for UI state that the
 * server does not own, such as which project is open in this tab.
 */
interface WorkspaceState {
  activeProjectId: string | null;
  sidebarOpen: boolean;
  setActiveProject(projectId: string | null): void;
  toggleSidebar(): void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  activeProjectId: null,
  sidebarOpen: true,
  setActiveProject: (projectId) => set({ activeProjectId: projectId }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
}));
