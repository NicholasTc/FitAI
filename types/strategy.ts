export type StrategyAction = "explain" | "adjust" | "protect";
export type SignalImpact = "positive" | "limiting" | "neutral";
export type StrategyConfidence = "high" | "medium" | "low";

export interface StrategySignal {
  signal: string;
  impact: SignalImpact;
}

export interface StrategyAdjustments {
  keep: string[];
  reduce: string[];
  move: string[];
  avoid: string[];
}

export interface StrategyResponse {
  title: string;
  reasoning: StrategySignal[];
  recommendedFocus?: string;
  /** Only present for "adjust" action */
  adjustments?: StrategyAdjustments;
  /** Only present for "protect" action */
  protectTomorrow?: string[];
  /** Only present for "protect" on a Recover day */
  minimumUsefulDay?: string[];
  confidence: StrategyConfidence;
  confidenceReason?: string;
}

export interface StrategyCacheEntry {
  summary: string;
  strategy: StrategyResponse;
  tasks?: string[]; // tasks used for "adjust" action
}
