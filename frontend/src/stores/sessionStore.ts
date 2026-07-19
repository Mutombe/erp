import { create } from 'zustand'
import type { InternalAxiosRequestConfig } from 'axios'

interface QueuedRequest {
  config: InternalAxiosRequestConfig
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
}

interface SessionState {
  isSessionExpired: boolean
  requestQueue: QueuedRequest[]
  setSessionExpired: (expired: boolean) => void
  addToQueue: (request: QueuedRequest) => void
  drainQueue: () => QueuedRequest[]
  clearQueue: () => void
}

export const useSessionStore = create<SessionState>((set, get) => ({
  isSessionExpired: false,
  requestQueue: [],

  setSessionExpired: (expired) => set({ isSessionExpired: expired }),

  addToQueue: (request) =>
    set((state) => ({ requestQueue: [...state.requestQueue, request] })),

  drainQueue: () => {
    const queue = get().requestQueue
    set({ requestQueue: [] })
    return queue
  },

  clearQueue: () => {
    const queue = get().requestQueue
    queue.forEach(({ reject }) => reject(new Error('Session ended — signed out')))
    set({ requestQueue: [] })
  },
}))
