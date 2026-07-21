import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const endpoint = process.env.WOLAI_MCP_ENDPOINT || 'https://api.wolai.com/v1/mcp'
const token = process.env.WOLAI_MCP_TOKEN

if (!token) {
  console.error('WOLAI_MCP_TOKEN is required')
  process.exit(1)
}

const client = new Client({ name: 'deek-pm-wolai-probe', version: '0.1.0' })
const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
  requestInit: {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  },
})

try {
  await client.connect(transport)
  const [tools, resources, prompts] = await Promise.allSettled([
    client.listTools(),
    client.listResources(),
    client.listPrompts(),
  ])
  console.log(JSON.stringify({ tools, resources, prompts }, null, 2))
} finally {
  await client.close()
}
