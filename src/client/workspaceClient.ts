import { creatorRequest } from './remoteRepository.js'

export interface CandidateView {
  id: string
  title: string
  claim: string
  source: { kind: string; ref: string }
  tags: string[]
  status: 'pending' | 'selected' | 'converted'
  convertedTopic?: string
}

export interface ProfileView {
  positioning?: string
  targetAudience?: string
  tone?: string
  directions?: string[]
  selectionCriteria?: string
}

export function listCandidates(status?: string): Promise<{ items: CandidateView[] }> {
  const suffix = status === undefined ? '' : `?status=${encodeURIComponent(status)}`
  return creatorRequest<{ items: CandidateView[] }>(`candidates${suffix}`)
}

export function addCandidate(input: {
  title: string
  claim: string
  sourceKind?: string
  sourceRef: string
  tags?: string[]
}): Promise<{ item: CandidateView }> {
  return creatorRequest<{ item: CandidateView }>('candidates', { method: 'POST', body: JSON.stringify(input) })
}

export function selectCandidates(ids: string[]): Promise<{ items: CandidateView[] }> {
  return creatorRequest<{ items: CandidateView[] }>('candidates/select', { method: 'POST', body: JSON.stringify({ ids }) })
}

export function convertCandidate(id: string): Promise<{ topic: { id: string; title: string }; candidate: CandidateView }> {
  return creatorRequest<{ topic: { id: string; title: string }; candidate: CandidateView }>('candidates/convert', { method: 'POST', body: JSON.stringify({ id }) })
}

export function getProfile(): Promise<{ profile: ProfileView; configured: boolean }> {
  return creatorRequest<{ profile: ProfileView; configured: boolean }>('profile')
}

export function saveProfile(patch: Partial<ProfileView>): Promise<{ profile: ProfileView; configured: boolean }> {
  return creatorRequest<{ profile: ProfileView; configured: boolean }>('profile', { method: 'POST', body: JSON.stringify(patch) })
}

export interface ScoreView {
  quality_score: number
  composite_score: number
  tier1?: unknown
  tier2?: unknown
  source: string
  note: string
}

export interface SimilarityView {
  pairs: Array<{ source: string; result: { max_similarity?: number } }>
  note: string
}

export function reviewScore(id: string): Promise<ScoreView> {
  return creatorRequest<ScoreView>('review-score', { method: 'POST', body: JSON.stringify({ id }) })
}

export function checkSimilarity(id: string, target: 'xhs' | 'video' | 'both' = 'both'): Promise<SimilarityView> {
  return creatorRequest<SimilarityView>('similarity-check', { method: 'POST', body: JSON.stringify({ id, target }) })
}
