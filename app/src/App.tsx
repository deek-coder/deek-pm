import { RouterProvider } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { router } from './router'
import { RepositoryProvider } from './repositories/RepositoryProvider'
import { RuntimeConfigProvider } from './runtimeConfig'
import { useRuntimeConfig } from './runtimeConfigContext'
import { ThemeProvider } from './theme/ThemeProvider'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RuntimeConfigProvider>
          <ConfiguredApp />
        </RuntimeConfigProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

function ConfiguredApp() {
  const { repositoryConfig } = useRuntimeConfig()
  return (
    <RepositoryProvider config={repositoryConfig}>
      <RouterProvider router={router} />
    </RepositoryProvider>
  )
}

export default App
