export type CiFailure = { branch: string; sha: string; names: string[]; runId: number }

declare module 'claude-code' {
  interface PluginState {
    'ci-watch': { failure: CiFailure | null }
  }
}
