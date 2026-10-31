// Friendly aliases over the generated schema (run `npm run gen:api` after contract changes).
import type { components } from './schema'

type S = components['schemas']

export type Health = S['Health']
export type Severity = S['Severity']
export type AgentName = S['AgentName']
export type AnalysisStatus = S['AnalysisStatus']
export type ProductInput = S['ProductInput']
export type AnalysisCreate = S['AnalysisCreate']
export type Product = S['Product']
export type Analysis = S['Analysis']
export type AnalysisStats = S['AnalysisStats']
export type AgentEvent = S['AgentEvent']
export type Verification = S['Verification']
export type Evidence = S['Evidence']
export type Claim = S['Claim']
export type Snapshot = S['Snapshot']
export type MatrixCell = S['MatrixCell']
export type Matrix = S['Matrix']
export type Change = S['Change']
export type Battlecard = S['Battlecard']
export type Gap = S['Gap']
export type Report = S['Report']
export type ChatRequest = S['ChatRequest']
export type ChatResponse = S['ChatResponse']
export type ChatMessage = NonNullable<ChatRequest['history']>[number]
export type Citation = ChatResponse['citations'][number]

export type EventLevel = AgentEvent['level']
export type VerificationStatus = Verification['status']
export type CellStatus = MatrixCell['verification_status'] // adds 'missing'
export type Advantage = NonNullable<MatrixCell['advantage']>
export type ChangeType = Change['change_type']

export interface ChangesQuery {
  product_id?: string
  severity?: Severity
}

export type StreamDoneStatus = 'completed' | 'failed'

export interface StreamHandlers {
  onEvent: (event: AgentEvent) => void
  onDone: (status: StreamDoneStatus) => void
  /** Called on a connection error; `willRetry` is true when a reconnect is scheduled. */
  onError?: (willRetry: boolean) => void
}

/** Everything the UI may call. Implemented by realApi (fetch) and mockApi (samples.json). */
export interface ApiClient {
  health(): Promise<Health>
  listAnalyses(): Promise<Analysis[]>
  createAnalysis(body: AnalysisCreate): Promise<Analysis>
  getAnalysis(id: string): Promise<Analysis>
  rerunAnalysis(id: string): Promise<Analysis>
  getMatrix(id: string): Promise<Matrix>
  getChanges(id: string, query?: ChangesQuery): Promise<Change[]>
  getReport(id: string): Promise<Report>
  getReportMarkdown(id: string): Promise<string>
  chat(id: string, body: ChatRequest): Promise<ChatResponse>
  getClaim(claimId: string): Promise<Claim>
  getSnapshot(snapshotId: string): Promise<Snapshot>
  /** Subscribe to the live trace. Returns an unsubscribe function. */
  openEventStream(analysisId: string, handlers: StreamHandlers): () => void
}
