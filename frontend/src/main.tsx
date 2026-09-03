import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App as AntApp } from 'antd'
import {
  QueryClient,
  QueryClientProvider,
  MutationCache,
} from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import 'dayjs/locale/zh-cn'
import './index.css'
import App from './App.tsx'
import { classifyApiError } from './api/index.ts'
import { emitMutationError } from './mutationToast.ts'

/**
 * B10: single mutation-error boundary. Every failed mutation surfaces a
 * classified toast (offline / server / validation / conflict) from the
 * MutationCache — components no longer need per-mutation onError just to
 * show a message. The toast API instance is registered by
 * <MutationToastBridge/> (App.tsx), which lives inside <AntApp> so the
 * message rendering follows the app theme.
 */
const mutationCache = new MutationCache({
  onError: (error) => emitMutationError(classifyApiError(error).message),
})

const queryClient = new QueryClient({
  mutationCache,
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        if (failureCount >= 3) return false
        const status = error?.response?.status
        if (status && status >= 400 && status < 500) return false
        return true
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AntApp>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </AntApp>
  </StrictMode>,
)
