import type { PrismaService } from '../../prisma/prisma.service';
import type { ICsvExporter } from './csv-exporter.interface';

interface LatencyRow {
  service_name: string;
  avg_proxy_ms: number | null;
  avg_gateway_ms: number | null;
  avg_request_ms: number | null;
}

export class LatencyCsvExporter implements ICsvExporter {
  constructor(private readonly prisma: PrismaService) {}

  async export(): Promise<string> {
    const rows = await this.prisma.$queryRaw<LatencyRow[]>`
      SELECT COALESCE(service_name, 'unknown') AS service_name,
             AVG(latency_proxy)   AS avg_proxy_ms,
             AVG(latency_gateway) AS avg_gateway_ms,
             AVG(latency_request) AS avg_request_ms
      FROM gateway_logs
      GROUP BY service_name
      ORDER BY avg_request_ms DESC
    `;

    const lines = ['service_name,avg_proxy_ms,avg_gateway_ms,avg_request_ms'];
    for (const row of rows) {
      const proxy = Number(row.avg_proxy_ms).toFixed(2);
      const gateway = Number(row.avg_gateway_ms).toFixed(2);
      const request = Number(row.avg_request_ms).toFixed(2);
      lines.push(`${row.service_name},${proxy},${gateway},${request}`);
    }
    return lines.join('\n');
  }
}
