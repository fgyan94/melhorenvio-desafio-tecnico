import type { PrismaService } from '../../prisma/prisma.service';
import type { ICsvExporter } from './csv-exporter.interface';

interface ServiceRow {
  service_name: string;
  total_requests: bigint | number;
}

export class ServiceCsvExporter implements ICsvExporter {
  constructor(private readonly prisma: PrismaService) {}

  async export(): Promise<string> {
    const rows = await this.prisma.$queryRaw<ServiceRow[]>`
      SELECT COALESCE(service_name, 'unknown') AS service_name,
             COUNT(*) AS total_requests
      FROM gateway_logs
      GROUP BY service_name
      ORDER BY total_requests DESC
    `;

    const lines = ['service_name,total_requests'];
    for (const row of rows) {
      lines.push(`${row.service_name},${Number(row.total_requests)}`);
    }
    return lines.join('\n');
  }
}
