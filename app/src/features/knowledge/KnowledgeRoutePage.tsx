import { lazy, Suspense } from 'react'

const LazyKnowledgePage = lazy(() => import('./KnowledgePage').then((module) => ({ default: module.KnowledgePage })))

export function KnowledgeRoutePage() {
  return (
    <Suspense fallback={<main className="grid h-full place-items-center text-sm text-muted-foreground">正在加载编辑器…</main>}>
      <LazyKnowledgePage />
    </Suspense>
  )
}
