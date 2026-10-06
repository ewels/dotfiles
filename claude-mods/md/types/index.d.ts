export type MdPath = string | null

declare module 'claude-code' {
  interface PluginState {
    md: { path: MdPath }
  }
}
