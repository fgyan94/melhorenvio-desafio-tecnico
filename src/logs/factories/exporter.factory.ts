import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConsumerCsvExporter } from '../exporters/consumer-csv-exporter';
import type {
  ExportType,
  ICsvExporter,
} from '../exporters/csv-exporter.interface';
import { LatencyCsvExporter } from '../exporters/latency-csv-exporter';
import { ServiceCsvExporter } from '../exporters/service-csv-exporter';

@Injectable()
export class ExporterFactory {
  constructor(private readonly prisma: PrismaService) {}

  create(type: ExportType): ICsvExporter {
    switch (type) {
      case 'consumer':
        return new ConsumerCsvExporter(this.prisma);
      case 'service':
        return new ServiceCsvExporter(this.prisma);
      case 'latency':
        return new LatencyCsvExporter(this.prisma);
      default:
        throw new BadRequestException(`Unknown export type: ${type as string}`);
    }
  }
}
