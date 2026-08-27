export const CREATOR_REMOTE_NAMESPACE = 'oriosCreator'

export const CREATOR_REMOTE_METHODS = [
  'listProjects',
  'createProject',
  'getProject',
  'updateArtifact',
  'getCapabilities',
  'getSettings',
  'saveSettings',
  'checkSettings',
  'approveGate',
  'runStage',
] as const

export type CreatorRemoteMethod = typeof CREATOR_REMOTE_METHODS[number]
