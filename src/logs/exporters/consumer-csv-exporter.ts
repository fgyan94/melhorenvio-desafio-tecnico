import type { PrismaService } from '../../prisma/prisma.service';
import type { ICsvExporter } from './csv-exporter.interface';

interface ConsumerRow {
  consumer_id: string;
  total_requests: bigint | number;
}

export class ConsumerCsvExporter implements ICsvExporter {
  constructor(private readonly prisma: PrismaService) {}

  async export(): Promise<string> {
    const rows = await this.prisma.$queryRaw<ConsumerRow[]>`
      SELECT COALESCE(consumer_id, 'anonymous') AS consumer_id,
             COUNT(*) AS total_requests
      FROM gateway_logs
      GROUP BY consumer_id
      ORDER BY total_requests DESC
    `;

    const lines = ['consumer_id,total_requests'];
    for (const row of rows) {
      lines.push(`${row.consumer_id},${Number(row.total_requests)}`);
    }
    return lines.join('\n');
  }
}
