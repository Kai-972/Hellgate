/**
 * One error type for the whole engine. Each kind maps to a CLI exit code, so a script
 * can tell "you used it wrong" from "the evidence is broken" without parsing text.
 */
export type ErrorKind =
  | 'usage' //       the caller asked for something that cannot be done
  | 'refused' //     a rule says no, e.g. verifying your own change
  | 'integrity' //   a record, hash or signature did not check out
  | 'environment' // a key, network or tool the run needs is missing
  | 'not-found'
  | 'interrupted';

export const EXIT_CODES: Record<ErrorKind | 'ok' | 'rejected' | 'pending', number> = {
  ok: 0,
  rejected: 1, // `hellgate check`: the change did not pass
  pending: 2, //  `hellgate check`: not enough evidence yet
  usage: 3,
  refused: 4,
  integrity: 5,
  environment: 6,
  interrupted: 7,
  'not-found': 3,
};

export class HellgateError extends Error {
  readonly kind: ErrorKind;
  constructor(kind: ErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'HellgateError';
    this.kind = kind;
  }
  get exitCode(): number {
    return EXIT_CODES[this.kind];
  }
}

export function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
