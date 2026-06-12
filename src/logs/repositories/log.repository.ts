import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ILogRepository, MappedLogEntry } from './log.repository.interface';

@Injectable()
export class LogRepository implements ILogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async insert(entry: MappedLogEntry): Promise<number> {
    const affectedRows = await this.prisma.$executeRaw`
      INSERT IGNORE INTO gateway_logs (
        line_hash,
        consumer_id,
        service_id,
        service_name,
        route_id,
        request_method,
        request_uri,
        request_url,
        request_size,
        request_querystring,
        response_status,
        response_size,
        upstream_uri,
        client_ip,
        latency_proxy,
        latency_gateway,
        latency_request,
        created_at
      ) VALUES (
        ${entry.line_hash},
        ${entry.consumer_id},
        ${entry.service_id},
        ${entry.service_name},
        ${entry.route_id},
        ${entry.request_method},
        ${entry.request_uri},
        ${entry.request_url},
        ${entry.request_size},
        ${entry.request_querystring},
        ${entry.response_status},
        ${entry.response_size},
        ${entry.upstream_uri},
        ${entry.client_ip},
        ${entry.latency_proxy},
        ${entry.latency_gateway},
        ${entry.latency_request},
        ${entry.created_at}
      )
    `;

    return affectedRows;
  }
}
