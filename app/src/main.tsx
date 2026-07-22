import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

let scrollbarFadeTimer: number | undefined
const revealScrollbars = () => {
  document.documentElement.dataset.scrollActive = 'true'
  if (scrollbarFadeTimer !== undefined) window.clearTimeout(scrollbarFadeTimer)
  scrollbarFadeTimer = window.setTimeout(() => {
    delete document.documentElement.dataset.scrollActive
    scrollbarFadeTimer = undefined
  }, 800)
}

document.addEventListener('scroll', revealScrollbars, true)
document.addEventListener('wheel', revealScrollbars, { capture: true, passive: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
