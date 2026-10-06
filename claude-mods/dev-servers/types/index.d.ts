export type DevServer = {
  pid: number
  ports: number[]
  process: string
  cwd: string
  /** The Bash command this session started it with; absent for servers started elsewhere. */
  command?: string
}

declare module 'claude-code' {
  interface PluginState {
    'dev-servers': { servers: DevServer[] }
  }
}
