export type SignBlock = {
  dir: string
  kind: 'commit' | 'push' | 'unsigned'
  at: number
  /** For `unsigned`: the commits a push would have sent unsigned, oldest first. */
  unsigned?: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'sign-wait': { block: SignBlock | null }
  }
}
