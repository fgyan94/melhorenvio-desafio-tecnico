export type ExportType = 'consumer' | 'service' | 'latency';

export interface ICsvExporter {
  export(): Promise<string>;
}
