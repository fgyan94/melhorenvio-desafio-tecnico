import { Injectable } from '@nestjs/common';
import { sha256 } from '../../common/hash.util';
import { LogEntrySchema } from '../schemas/log-entry.schema';

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

@Injectable()
export class LogParserService {
  parse(rawLine: string): MappedLogEntry {
    const parsed = JSON.parse(rawLine) as unknown;
    const entry = LogEntrySchema.parse(parsed);

    const startedAt = entry.started_at;

    return {
      line_hash: sha256(rawLine),
      consumer_id: entry.authenticated_entity?.consumer_id?.uuid ?? null,
      service_id: entry.service?.id ?? null,
      service_name: entry.service?.name ?? null,
      route_id: entry.route?.id ?? null,
      request_method: entry.request?.method ?? null,
      request_uri: entry.request?.uri ?? null,
      request_url: entry.request?.url ?? null,
      request_size: entry.request?.size ?? null,
      request_querystring:
        entry.request?.querystring !== undefined
          ? JSON.stringify(entry.request.querystring)
          : null,
      response_status: entry.response?.status ?? null,
      response_size: entry.response?.size ?? null,
      upstream_uri: entry.upstream_uri ?? null,
      client_ip: entry.client_ip ?? null,
      latency_proxy: entry.latencies?.proxy ?? null,
      latency_gateway: entry.latencies?.gateway ?? null,
      latency_request: entry.latencies?.request ?? null,
      created_at:
        typeof startedAt === 'number' ? new Date(startedAt * 1000) : null,
    };
  }
}
