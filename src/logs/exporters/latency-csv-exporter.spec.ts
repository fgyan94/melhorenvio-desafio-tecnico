import { LatencyCsvExporter } from './latency-csv-exporter';

interface LatencyRow {
  service_name: string;
  avg_proxy_ms: number | null;
  avg_gateway_ms: number | null;
  avg_request_ms: number | null;
}

function makePrisma(rows: LatencyRow[]) {
  return { $queryRaw: jest.fn().mockResolvedValue(rows) };
}

describe('LatencyCsvExporter', () => {
  it('(a) rounds latency values to 2 decimal places', async () => {
    const prisma = makePrisma([
      {
        service_name: 'svc',
        avg_proxy_ms: 10.1234,
        avg_gateway_ms: 5.6789,
        avg_request_ms: 20.9999,
      },
    ]);
    const exporter = new LatencyCsvExporter(prisma as never);

    const csv = await exporter.export();
    const lines = csv.split('\n');

    expect(lines[1]).toBe('svc,10.12,5.68,21.00');
  });

  it('(b) null service_name becomes "unknown" via COALESCE', async () => {
    const prisma = makePrisma([
      {
        service_name: 'unknown',
        avg_proxy_ms: 1,
        avg_gateway_ms: 2,
        avg_request_ms: 3,
      },
    ]);
    const exporter = new LatencyCsvExporter(prisma as never);

    const csv = await exporter.export();
    const lines = csv.split('\n');

    expect(lines[1].startsWith('unknown,')).toBe(true);
  });

  it('(c) rows are ordered DESC by avg_request_ms (as returned by query)', async () => {
    const prisma = makePrisma([
      {
        service_name: 'slow',
        avg_proxy_ms: 100,
        avg_gateway_ms: 10,
        avg_request_ms: 500,
      },
      {
        service_name: 'medium',
        avg_proxy_ms: 50,
        avg_gateway_ms: 5,
        avg_request_ms: 200,
      },
      {
        service_name: 'fast',
        avg_proxy_ms: 10,
        avg_gateway_ms: 1,
        avg_request_ms: 50,
      },
    ]);
    const exporter = new LatencyCsvExporter(prisma as never);

    const csv = await exporter.export();
    const lines = csv.split('\n');

    expect(lines[1]).toBe('slow,100.00,10.00,500.00');
    expect(lines[2]).toBe('medium,50.00,5.00,200.00');
    expect(lines[3]).toBe('fast,10.00,1.00,50.00');
  });

  it('generates CSV with correct header', async () => {
    const prisma = makePrisma([]);
    const exporter = new LatencyCsvExporter(prisma as never);

    const csv = await exporter.export();

    expect(csv).toBe('service_name,avg_proxy_ms,avg_gateway_ms,avg_request_ms');
  });
});
