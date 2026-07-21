export async function changeServicePassword(baseUrl: string, accessToken: string, currentPassword: string, newPassword: string) {
  const response = await fetch(`${baseUrl}/api/v1/auth/change-password`, {
    method: 'POST',
    signal: AbortSignal.timeout(15_000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ currentPassword, newPassword }),
  })
  const payload = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(payload.error ?? `密码修改失败（HTTP ${response.status}）`)
}
