export type RequirementStatus = 'uploaded' | 'analyzing' | 'analyzed'
export type Disposition = 'pending' | 'accepted' | 'partial' | 'rejected' | 'deferred'

export interface User {
  id: string
  username: string
  displayName: string
  role: 'admin' | 'user'
}

export interface Settings {
  baseUrl: string
  model: string
  requirementSkillVersion: string
  reviewSkillVersion: string
  apiKeyConfigured: boolean
  maskedApiKey: string
}

export interface PendingItem {
  id: string
  title: string
  description: string
  sourceHint: string
  status: 'open' | 'answered' | 'ignored'
  answer: string
}

export interface AnalysisProgressStep {
  id: string
  label: string
  description: string
  status: 'pending' | 'active' | 'completed'
}

export interface AnalysisProgress {
  status: 'running' | 'completed' | 'failed'
  percent: number
  title: string
  detail: string
  steps: AnalysisProgressStep[]
  startedAt: string
  updatedAt: string
}

export interface AnalysisVersion {
  id: string
  versionNo: number
  changeReason: string
  sourceText: string
  html: string
  pendingItems: PendingItem[]
  skillVersion: string
  pipelineMode?: 'codex-skill' | 'demo' | 'legacy-model' | string
  pipelineSkill?: string
  validation?: {
    ok: boolean
    pageCount: number
    businessFlowNodeCount: number
    pageFlowEdgeCount: number
    afLayerCount: number
    designReviewPageCount: number
    competitorFeatureCount: number
    competitorEvidenceCount: number
    sourceRequirementCount: number
    unmappedCount: number
  } | null
  runId?: string
  artifactPath?: string
  wireframe?: {
    status: 'completed' | 'failed'
    skillVersion: string
    generatedAt: string
    createdBy: string
    summary: string
    files: { name: string; title: string; svg: string }[]
    interactions: string[]
    fields: { page: string; name: string; type?: string; required?: string; description?: string }[]
    navigation: { from: string; to: string; trigger?: string; condition?: string }[]
    error?: string
  }
  createdAt: string
  createdBy: string
}

export interface DesignFile {
  id: string
  name: string
  type: string
  extension: string
  url: string
  order: number
}

export interface DesignVersion {
  id: string
  versionNo: number
  files: DesignFile[]
  note: string
  createdAt: string
  createdBy: string
}

export interface CompetitorVersion {
  id: string
  versionNo: number
  featureName: string
  files: DesignFile[]
  evidenceStats: {
    fileCount: number
    sheetCount: number
    embeddedImageCount: number
    directImageCount: number
  }
  createdAt: string
  createdBy: string
}

export interface ReviewIssue {
  id: string
  type: string
  process: string
  title: string
  detail: string
  people: string
  severity: 'low' | 'medium' | 'high'
  conformity: 'conforming' | 'partial' | 'nonconforming'
  basis: 'requirement' | 'design_principle' | 'experience_skill' | 'validate_user_experience' | 'ui_review_skill' | 'competitor'
  journeyStage: string
  validationDimension: string
  experienceLevel: '' | 'P0' | 'P1' | 'P2' | 'P3' | 'P4'
  userPerspective: string
  rootCause: string
  userImpact: string
  solution: string
  analogousCheck: string
  reviewCode: string
  reviewArea: '' | 'visual' | 'interaction' | 'system' | 'accessibility'
  reviewPriority: '' | 'P0' | 'P1' | 'P2' | 'P3' | 'P4'
  confidence: '' | 'confirmed' | 'high' | 'medium' | 'low' | 'needs_review'
  evidence: string
  verification: string
  mustFix: boolean
  evidenceStatus: 'sufficient' | 'needs_confirmation'
  disposition: Disposition
  reasonCategory: string
  feedbackReason: string
  decidedAt: string
  annotation?: {
    pageName?: string
    pageFileName?: string
    anchorText?: string
    x?: number
    y?: number
    width?: number
    height?: number
    coordinateMode?: 'normalized' | 'pixel'
    confidence?: number
  }
}

export interface Review {
  id: string
  versionNo: number
  analysisVersionId: string
  analysisVersionNo: number
  requirementEvidenceMode: 'analyzed' | 'raw'
  requirementSourceFilename: string
  designVersionId: string
  designVersionNo: number
  competitorVersionId: string
  competitorVersionNo: number
  competitorFeatureName: string
  competitorStatus: 'not_provided' | 'completed' | 'failed'
  competitorError: string
  competitorEvidenceStats?: CompetitorVersion['evidenceStats'] | null
  uiDesignReviewEnabled: boolean
  uiDesignReviewStatus: 'not_selected' | 'completed' | 'failed'
  uiDesignReviewSkillVersion: string
  uiDesignReviewError: string
  uiDesignReviewSummary: string
  uiDesignReviewStrengths: string[]
  uiDesignReviewEvidenceLimitations: string[]
  uiDesignReviewOpenQuestions: string[]
  validationConclusion: '' | 'passed' | 'conditional' | 'not_passed' | 'undetermined'
  experienceSkillVersion: string
  experienceValidationSummary: string
  experiencePositiveEvidence: string[]
  experienceGaps: string[]
  experienceRetest: string[]
  experienceTaskCoverage: Array<Record<string, unknown>>
  rawEvidenceStats?: {
    sourceCharacters: number
    chunkCount: number
    pageCount: number
    openQuestionCount: number
  } | null
  saved: boolean
  savedAt: string
  discardedAt?: string
  baseReviewStatus: 'completed' | 'partial'
  baseReviewError: string
  failedReviewPages: string[]
  status: string
  summary: string
  issues: ReviewIssue[]
  skillVersion: string
  createdAt: string
  createdBy: string
}

export interface AnalysisFeedback {
  id: string
  analysisVersionId: string
  analysisVersionNo: number
  skillVersion: string
  category: string
  target: string
  description: string
  expectedResult: string
  generalizable: boolean
  createdAt: string
  createdBy: string
}

export interface Requirement {
  id: string
  productName: string
  version: string
  requirementName: string
  summary: string
  status: RequirementStatus
  source: {
    filename: string
    type: string
    text: string
    savedPath: string
  }
  currentAnalysisVersionId: string
  analysisVersions: AnalysisVersion[]
  designVersions: DesignVersion[]
  competitorVersions: CompetitorVersion[]
  reviews: Review[]
  analysisFeedback: AnalysisFeedback[]
  analysisProgress?: AnalysisProgress
  createdAt: string
  updatedAt: string
}

export interface RequirementSummary {
  id: string
  productName: string
  version: string
  requirementName: string
  summary: string
  status: RequirementStatus
  analysisVersion: number
  pendingCount: number
  designVersion: number
  reviewStatus: string
  updatedAt: string
}

export interface Analytics {
  requirementCount: number
  analyzedCount: number
  reviewCount: number
  opinionCount: number
  strictAcceptanceRate: number
  overallAcceptanceRate: number
  products: {
    name: string
    total: number
    accepted: number
    reviewCount: number
    records: {
      requirementId: string
      requirementVersion: string
      reviewId: string
      reviewVersionNo: number
      validationConclusion: Review['validationConclusion']
      requirementEvidenceMode: 'analyzed' | 'raw'
      analysisVersionNo: number
      designVersionNo: number
      competitorFeatureName: string
      competitorStatus: Review['competitorStatus']
      opinionCount: number
      feedbackCount: number
      acceptanceRate: number
      savedAt: string
      createdBy: string
    }[]
  }[]
  allRecords: {
    requirementId: string
    requirementVersion: string
    requirementSummary: string
    productName: string
    reviewId: string
    reviewVersionNo: number
    designVersionNo: number
    opinionCount: number
    feedbackCount: number
    state: 'saved' | 'draft' | 'discarded'
    createdAt: string
    savedAt: string
    discardedAt: string
  }[]
  monthly: { month: string; total: number; accepted: number }[]
}

export interface OptimizationReport {
  overview: string
  patterns: string[]
  recommendations: string[]
  regressionCases: string[]
  risks: string[]
}

export interface OptimizationRun {
  id: string
  type: 'requirement' | 'review'
  targetSkill: string
  optimizerVersion?: string
  sampleCount: number
  status: string
  report: OptimizationReport
  createdAt: string
  createdBy: string
}

export interface BootstrapData {
  user: User
  settings: Settings
  requirements: RequirementSummary[]
  analytics: Analytics
  optimizationRuns: OptimizationRun[]
}
