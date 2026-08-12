import { useEffect, useState } from 'react'
import { Download, ExternalLink, RefreshCw, RotateCcw } from 'lucide-react'
import deekLogoMark from '../../assets/deek-logo-mark.png'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { cn } from '../../shared/cn'

const releasesUrl = 'https://github.com/deek-coder/deek-pm/releases'

const phaseLabel: Record<DeekUpdatePhase, string> = {
  unsupported: '不可用',
  idle: '等待检查',
  checking: '检查中',
  available: '发现新版本',
  'not-available': '已是最新',
  downloading: '下载中',
  downloaded: '等待安装',
  installing: '正在安装',
  error: '更新失败',
}

function formatBytes(value?: number) {
  if (!value || value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const order = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  return `${(value / 1024 ** order).toFixed(order === 0 ? 0 : 1)} ${units[order]}`
}

function updateAction(state: DeekUpdateState | null) {
  if (!state || state.phase === 'unsupported') return { label: '检查更新', action: 'none' as const, disabled: true }
  if (state.phase === 'checking') return { label: '正在检查…', action: 'none' as const, disabled: true }
  if (state.phase === 'available') return { label: `下载 v${state.latestVersion}`, action: 'download' as const, disabled: false }
  if (state.phase === 'downloading') return { label: `下载中 ${Math.round(state.percent ?? 0)}%`, action: 'none' as const, disabled: true }
  if (state.phase === 'downloaded') return { label: '重启并安装', action: 'install' as const, disabled: false }
  if (state.phase === 'installing') return { label: '正在重启…', action: 'none' as const, disabled: true }
  return { label: state.phase === 'error' ? '重新检查' : '检查更新', action: 'check' as const, disabled: false }
}

export function ApplicationUpdateCard({ className, layout = 'responsive' }: { className?: string; layout?: 'responsive' | 'wide' }) {
  const [state, setState] = useState<DeekUpdateState | null>(null)

  useEffect(() => {
    const bridge = window.deek
    if (!bridge?.getUpdateState) return
    const unsubscribe = bridge.onUpdateState?.((nextState) => setState(nextState))
    void bridge.getUpdateState().then(setState).catch(() => undefined)
    return () => unsubscribe?.()
  }, [])

  const action = updateAction(state)
  const runAction = async () => {
    if (action.action === 'check') setState(await window.deek!.checkForUpdates())
    if (action.action === 'download') setState(await window.deek!.downloadUpdate())
    if (action.action === 'install') await window.deek!.installUpdate()
  }
  const percent = Math.max(0, Math.min(100, state?.percent ?? 0))
  const badgeVariant = state?.phase === 'error' ? 'destructive' : state?.phase === 'available' || state?.phase === 'downloaded' ? 'default' : 'secondary'
  const wide = layout === 'wide'

  if (wide) {
    return (
      <div className={cn('grid min-h-full grid-cols-[17rem_minmax(0,1fr)] bg-background/85', className)}>
        <aside className="flex flex-col items-center justify-center border-r bg-muted/30 px-8 py-10 text-center">
          <img
            src={deekLogoMark}
            alt="Deek PM"
            className="size-28 rounded-[1.75rem] border border-border/60 shadow-[0_18px_45px_rgba(15,23,42,0.18)]"
          />
          <h2 className="mt-6 text-2xl font-semibold tracking-[-0.03em]">Deek PM</h2>
          <p className="mt-1 text-[length:var(--text-callout)] text-muted-foreground">
            版本 {state?.currentVersion ?? '—'}
          </p>
          <div className="mt-5 flex items-center gap-2 text-[length:var(--text-caption)] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            <span>稳定版通道</span>
          </div>
          <Button className="mt-7" size="sm" variant="ghost" onClick={() => void window.deek?.openExternal?.(releasesUrl)}>
            <ExternalLink size={14} />
            版本记录
          </Button>
        </aside>

        <section className="flex min-w-0 flex-col justify-center px-12 py-10">
          <div className="flex items-start justify-between gap-5">
            <div className="min-w-0">
              <p className="text-[length:var(--text-caption)] font-medium tracking-[0.08em] text-muted-foreground uppercase">Software Update</p>
              <h2 className="mt-2 text-[1.75rem] font-semibold tracking-[-0.035em] text-foreground">软件更新</h2>
              <p className="mt-2 max-w-lg text-[length:var(--text-body)] leading-7 text-muted-foreground">
                Deek PM 会从 GitHub Releases 安全获取稳定版本，由你决定何时下载和安装。
              </p>
            </div>
            <Badge className="mt-1 shrink-0" variant={badgeVariant}>{state ? phaseLabel[state.phase] : '读取中'}</Badge>
          </div>

          <div className="mt-8 rounded-2xl border border-border/70 bg-muted/25 px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]">
            <p className="text-base font-medium leading-6">{state?.message ?? '正在读取版本信息…'}</p>
            {state?.latestVersion && state.latestVersion !== state.currentVersion && (
              <p className="mt-1.5 text-[length:var(--text-callout)] text-muted-foreground">可更新至版本 v{state.latestVersion}</p>
            )}
            {state?.error && <p className="mt-2 break-words text-[length:var(--text-callout)] text-destructive">{state.error}</p>}
            {state?.phase === 'downloading' && (
              <div className="mt-4">
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
                </div>
                <div className="mt-2 flex justify-between text-[length:var(--text-caption)] text-muted-foreground">
                  <span>{formatBytes(state.transferred)} / {formatBytes(state.total)}</span>
                  <span>{formatBytes(state.bytesPerSecond)}/s</span>
                </div>
              </div>
            )}
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={() => void runAction()} disabled={action.disabled}>
              {action.action === 'download' ? <Download size={17} /> : action.action === 'install' ? <RotateCcw size={17} /> : <RefreshCw size={17} />}
              {action.label}
            </Button>
            <Button size="lg" variant="outline" onClick={() => void window.deek?.openExternal?.(releasesUrl)}>
              手动下载
            </Button>
          </div>

          <p className="mt-5 text-[length:var(--text-caption)] leading-5 text-muted-foreground">
            {state?.distribution === 'portable'
              ? '当前为便携版，请下载新版本后手动替换。'
              : state?.distribution === 'installed'
                ? '下载完成后，你可以立即重启安装，也可以稍后退出应用时安装。'
                : '开发环境不会执行自动更新，请在安装版中测试更新流程。'}
          </p>
        </section>
      </div>
    )
  }

  return (
    <Card className={cn('overflow-hidden p-0', className)}>
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.72fr)]">
        <div className="flex gap-4 p-5 sm:items-center">
          <img src={deekLogoMark} alt="Deek PM" className="size-16 rounded-2xl border border-border/70 shadow-sm" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="deek-page-section-title">Deek PM</h2>
              <Badge variant="secondary">v{state?.currentVersion ?? '—'}</Badge>
            </div>
            <p className="mt-1.5 text-[length:var(--text-body)] leading-relaxed text-muted-foreground">
              本地优先的项目知识工作台。支持离线加密、自部署服务与统一资产存储。
            </p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[length:var(--text-callout)] text-muted-foreground">
              <span>更新通道：稳定版</span>
              <span>·</span>
              <span>{state?.distribution === 'portable' ? '便携版' : state?.distribution === 'installed' ? '安装版' : '开发环境'}</span>
            </div>
            <Button className="mt-4" size="sm" variant="ghost" onClick={() => void window.deek?.openExternal?.(releasesUrl)}>
              <ExternalLink size={14} />
              GitHub Releases
            </Button>
          </div>
        </div>

        <div className="border-t bg-muted/20 p-5 lg:border-l lg:border-t-0">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="deek-page-section-title">软件更新</h2>
              <p className="mt-1 text-[length:var(--text-callout)] text-muted-foreground">自动从 GitHub Releases 获取稳定版本。</p>
            </div>
            <Badge variant={badgeVariant}>{state ? phaseLabel[state.phase] : '读取中'}</Badge>
          </div>

          <div className="mt-4 rounded-lg border bg-background/70 p-3">
            <p className="text-[length:var(--text-body)] font-medium">{state?.message ?? '正在读取版本信息…'}</p>
            {state?.latestVersion && state.latestVersion !== state.currentVersion && (
              <p className="mt-1 text-[length:var(--text-callout)] text-muted-foreground">最新版本：v{state.latestVersion}</p>
            )}
            {state?.error && <p className="mt-2 break-words text-[length:var(--text-callout)] text-destructive">{state.error}</p>}
            {state?.phase === 'downloading' && (
              <div className="mt-3">
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
                </div>
                <div className="mt-1.5 flex justify-between text-[length:var(--text-caption)] text-muted-foreground">
                  <span>{formatBytes(state.transferred)} / {formatBytes(state.total)}</span>
                  <span>{formatBytes(state.bytesPerSecond)}/s</span>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => void runAction()} disabled={action.disabled}>
              {action.action === 'download' ? <Download size={16} /> : action.action === 'install' ? <RotateCcw size={16} /> : <RefreshCw size={16} />}
              {action.label}
            </Button>
            <Button variant="outline" onClick={() => void window.deek?.openExternal?.(releasesUrl)}>
              手动下载
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}
