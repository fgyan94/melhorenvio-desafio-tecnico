export const FAILURE_REPOSITORY = Symbol('IFailureRepository');

export interface FailureData {
  lineHash: string;
  rawLine: string;
  errorMessage: string;
}

export interface IFailureRepository {
  save(data: FailureData): Promise<void>;
}
