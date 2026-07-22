import { Minus, Square, X } from 'lucide-react'
import { useTheme } from '../../theme/themeContext'
import { cn } from '../../shared/cn'

export function WindowControls() {
  if (typeof window === 'undefined' || !window.deek) return null

  return <WindowControlsInner />
}

function WindowControlsInner() {
  const { theme } = useTheme()

  if (theme === 'macos') {
    return (
      <div className="electron-no-drag fixed left-0 top-0 z-50 flex h-12 items-center gap-2 px-3.5">
        <TrafficLight
          className="bg-[#ff5f57] hover:brightness-95"
          label="关闭窗口"
          symbol="×"
          onClick={() => void window.deek?.closeWindow()}
        />
        <TrafficLight
          className="bg-[#febc2e] hover:brightness-95"
          label="最小化窗口"
          symbol="−"
          onClick={() => void window.deek?.minimizeWindow()}
        />
        <TrafficLight
          className="bg-[#28c840] hover:brightness-95"
          label="最大化窗口"
          symbol="+"
          onClick={() => void window.deek?.toggleMaximizeWindow()}
        />
      </div>
    )
  }

  return (
    <div className="electron-no-drag fixed right-0 top-0 z-50 flex h-12 items-center">
      <button
        className="electron-no-drag grid h-12 w-11 place-items-center text-muted-foreground transition hover:bg-[var(--nav-item-hover-bg)] hover:text-foreground"
        aria-label="最小化窗口"
        onClick={() => void window.deek?.minimizeWindow()}
      >
        <Minus className="size-4" />
      </button>
      <button
        className="electron-no-drag grid h-12 w-11 place-items-center text-muted-foreground transition hover:bg-[var(--nav-item-hover-bg)] hover:text-foreground"
        aria-label="最大化窗口"
        onClick={() => void window.deek?.toggleMaximizeWindow()}
      >
        <Square className="size-3.5" />
      </button>
      <button
        className="electron-no-drag grid h-12 w-11 place-items-center text-muted-foreground hover:bg-red-500 hover:text-white"
        aria-label="关闭窗口"
        onClick={() => void window.deek?.closeWindow()}
      >
        <X className="size-4" />
      </button>
    </div>
  )
}

function TrafficLight({
  className,
  label,
  symbol,
  onClick,
}: {
  className: string
  label: string
  symbol: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        'electron-no-drag group relative grid h-[13px] w-[13px] place-items-center rounded-full shadow-[inset_0_-0.5px_0.5px_rgba(0,0,0,0.18)] transition',
        className,
      )}
    >
      <span className="pointer-events-none text-[9px] font-bold leading-none text-black/55 opacity-0 transition group-hover:opacity-100">
        {symbol}
      </span>
    </button>
  )
}

export function WindowDragStrip() {
  if (typeof window === 'undefined' || !window.deek) return null

  return <div className="electron-drag deek-titlebar-drag fixed left-0 right-0 top-0 z-40 h-12" />
}
