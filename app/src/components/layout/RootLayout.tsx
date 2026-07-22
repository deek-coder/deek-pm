import { Outlet } from '@tanstack/react-router'
import { WindowControls } from './WindowControls'

export function RootLayout() {
  return (
    <>
      <WindowControls />
      <Outlet />
    </>
  )
}
