export type ServiceStorageSettings =
  | { configured: false }
  | { configured: true; driver: 'filesystem'; filesystemPath: string; updatedAt: string }
  | {
      configured: true
      driver: 's3'
      endpoint: string
      region: string
      bucket: string
      forcePathStyle: boolean
      hasCredentials: boolean
      updatedAt: string
    }

export type ServiceStorageInput =
  | { driver: 'filesystem'; filesystemPath: string }
  | {
      driver: 's3'
      endpoint: string
      region: string
      bucket: string
      forcePathStyle: boolean
      accessKey?: string
      secretKey?: string
    }

async function request<T>(baseUrl: string, accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}/api/v1${path}`, {
    ...init,
    signal: AbortSignal.timeout(15_000),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...init?.headers,
    },
  })
  const payload = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(payload.error ?? `存储配置请求失败（HTTP ${response.status}）`)
  return payload as T
}

export function getServiceStorageSettings(baseUrl: string, accessToken: string) {
  return request<ServiceStorageSettings>(baseUrl, accessToken, '/storage/settings')
}

export function testServiceStorageSettings(baseUrl: string, accessToken: string, input: ServiceStorageInput) {
  return request<{ ok: true }>(baseUrl, accessToken, '/storage/settings/test', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function saveServiceStorageSettings(baseUrl: string, accessToken: string, input: ServiceStorageInput) {
  return request<{ ok: true }>(baseUrl, accessToken, '/storage/settings', {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}
