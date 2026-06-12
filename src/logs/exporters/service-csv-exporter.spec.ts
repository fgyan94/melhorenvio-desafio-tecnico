import { ServiceCsvExporter } from './service-csv-exporter';

function makePrisma(rows: { service_name: string; total_requests: bigint | number }[]) {
  return { $queryRaw: jest.fn().mockResolvedValue(rows) };
}

describe('ServiceCsvExporter', () => {
  it('(a) generates CSV with correct header', async () => {
    const prisma = makePrisma([{ service_name: 'svc-a', total_requests: 4n }]);
    const exporter = new ServiceCsvExporter(prisma as never);

    const csv = await exporter.export();
    const lines = csv.split('\n');

    expect(lines[0]).toBe('service_name,total_requests');
  });

  it('(b) null service_name becomes "unknown" via COALESCE', async () => {
    const prisma = makePrisma([{ service_name: 'unknown', total_requests: 2n }]);
    const exporter = new ServiceCsvExporter(prisma as never);

    const csv = await exporter.export();
    const lines = csv.split('\n');

    expect(lines[1]).toBe('unknown,2');
  });

  it('(c) rows are ordered DESC by total_requests (as returned by query)', async () => {
    const prisma = makePrisma([
      { service_name: 'alpha', total_requests: 20n },
      { service_name: 'beta', total_requests: 8n },
      { service_name: 'gamma', total_requests: 1n },
    ]);
    const exporter = new ServiceCsvExporter(prisma as never);

    const csv = await exporter.export();
    const lines = csv.split('\n');

    expect(lines[1]).toBe('alpha,20');
    expect(lines[2]).toBe('beta,8');
    expect(lines[3]).toBe('gamma,1');
  });
});
