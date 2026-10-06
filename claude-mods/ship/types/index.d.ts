export type RepoState = { name: string; branch: string; changed: number; ahead: number; hasUpstream: boolean; hasPr: boolean }

declare module 'claude-code' {
  interface PluginState {
    ship: { repo: RepoState | null }
  }
}
