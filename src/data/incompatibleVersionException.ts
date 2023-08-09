export class IncompatibleVersionException extends Error {
    constructor(
        message?: string,
        expectedVersion?: string,
        actualVersion?: string) {
      super(message);
      this.name = 'IncompatibleVersionException';
      this.expectedVersion = expectedVersion?expectedVersion:"";
      this.actualVersion = actualVersion?actualVersion:"";
    }
    expectedVersion: string;
    actualVersion: string;
}