/** Thrown when a table or CSV uses syntax that cannot be processed safely. */
export class UnsupportedTableError extends Error {
  /** 1-based line number in the source file where the issue was detected, if available. */
  readonly line?: number;

  constructor(message: string, options?: { line?: number }) {
    super(message);
    this.name = "UnsupportedTableError";
    this.line = options?.line;
  }
}
