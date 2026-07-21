import { Minus, Square, X } from 'lucide-react'

export function WindowControls() {
  if (typeof window === 'undefined' || !window.deek) return null

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

export function WindowDragStrip() {
  if (typeof window === 'undefined' || !window.deek) return null

  return <div className="electron-drag fixed left-0 right-0 top-0 z-40 h-12" />
}
