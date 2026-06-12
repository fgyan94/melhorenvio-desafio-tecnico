import { BadRequestException } from '@nestjs/common';
import { ConsumerCsvExporter } from '../exporters/consumer-csv-exporter';
import { LatencyCsvExporter } from '../exporters/latency-csv-exporter';
import { ServiceCsvExporter } from '../exporters/service-csv-exporter';
import { ExporterFactory } from './exporter.factory';

const prisma = { $queryRaw: jest.fn() };

describe('ExporterFactory', () => {
  it('(a) "consumer" returns a ConsumerCsvExporter instance', () => {
    const factory = new ExporterFactory(prisma as never);
    expect(factory.create('consumer')).toBeInstanceOf(ConsumerCsvExporter);
  });

  it('(b) "service" returns a ServiceCsvExporter instance', () => {
    const factory = new ExporterFactory(prisma as never);
    expect(factory.create('service')).toBeInstanceOf(ServiceCsvExporter);
  });

  it('(c) "latency" returns a LatencyCsvExporter instance', () => {
    const factory = new ExporterFactory(prisma as never);
    expect(factory.create('latency')).toBeInstanceOf(LatencyCsvExporter);
  });

  it('(d) unknown type throws BadRequestException', () => {
    const factory = new ExporterFactory(prisma as never);
    expect(() => factory.create('unknown' as never)).toThrow(
      BadRequestException,
    );
  });
});
