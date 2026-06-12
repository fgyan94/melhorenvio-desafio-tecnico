export const LOG_REPOSITORY = Symbol('ILogRepository');

export interface MappedLogEntry {
  line_hash: string;
  consumer_id: string | null;
  service_id: string | null;
  service_name: string | null;
  route_id: string | null;
  request_method: string | null;
  request_uri: string | null;
  request_url: string | null;
  request_size: number | null;
  request_querystring: string | null;
  response_status: number | null;
  response_size: number | null;
  upstream_uri: string | null;
  client_ip: string | null;
  latency_proxy: number | null;
  latency_gateway: number | null;
  latency_request: number | null;
  created_at: Date | null;
}

export interface ILogRepository {
  insert(entry: MappedLogEntry): Promise<number>;
}
