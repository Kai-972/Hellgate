// The contract between the engine and an agent. FROZEN: a change that touches this file is stopped by
// the guards (PROTOCOL §12.1). Types only, so it is erased at run time.

export interface TaskBrief {
  readonly id: string;
  readonly title: string;
  readonly brief: string; //                                   brief.md, verbatim
  readonly entry: string; //                                   the file the tests import, e.g. "solution.mjs"
  readonly api: readonly { name: string; signature: string }[];
  readonly constraints: readonly string[];
  readonly starter: readonly { path: string; contents: string }[];
}

export interface ModelRequest {
  readonly tag: string; //                                     a distinct label per call site: "draft", "repair#1"
  readonly slot?: 'primary' | 'secondary'; //                  which model answers. Default "primary".
  readonly system?: string;
  readonly messages: readonly { role: 'user' | 'assistant'; text: string }[];
  readonly maxOutputTokens?: number;
  readonly temperature?: number;
  readonly stop?: readonly string[];
}

export interface ModelReply {
  readonly text: string;
  readonly finish: 'stop' | 'length' | 'other';
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface Kit {
  readonly model: { generate(req: ModelRequest): Promise<ModelReply> };
  readonly budget: { remaining(): { calls: number; tokens: number; ms: number } };
  readonly trace: (event: string, data?: Record<string, unknown>) => void;
  readonly random: () => number; //                            seeded per run
}

export interface Answer {
  readonly files: readonly { path: string; contents: string }[];
}
