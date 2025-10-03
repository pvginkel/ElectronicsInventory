declare module 'traceparent' {
  interface TraceParentConfig {
    transactionSampleRate: number;
  }

  export default class TraceParent {
    readonly traceId: string;
    readonly recorded: boolean;
    ensureParentId(): string;
    child(): TraceParent;
    toString(): string;
    static startOrResume(parent?: TraceParent | string | null, config?: TraceParentConfig): TraceParent;
    static fromString(header: string): TraceParent;
  }
}
