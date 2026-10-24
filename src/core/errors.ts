/** Thrown when a table uses syntax that this editor cannot round-trip safely. */
export class UnsupportedTableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedTableError";
  }
}
