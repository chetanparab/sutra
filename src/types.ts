export type Mode = 'specless' | 'spec'

export type StageId = 'intent' | 'spec' | 'tasks' | 'loop' | 'review' | 'merge'

export type StageState = 'done' | 'active' | 'attention' | 'available' | 'locked'

export interface StageItem {
  id: StageId
  label: string
  state: StageState
  hint?: string
}

export type SpecPhase = 'none' | 'generating' | 'draft' | 'approved'

export type LoopSubtab = 'design' | 'run'
