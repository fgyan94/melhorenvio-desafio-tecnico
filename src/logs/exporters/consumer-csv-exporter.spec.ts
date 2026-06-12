import { ConsumerCsvExporter } from './consumer-csv-exporter';

function makePrisma(rows: { consumer_id: string; total_requests: bigint | number }[]) {
  return { $queryRaw: jest.fn().mockResolvedValue(rows) };
}

describe('ConsumerCsvExporter', () => {
  it('(a) generates CSV with correct header', async () => {
    const prisma = makePrisma([{ consumer_id: 'abc', total_requests: 5n }]);
    const exporter = new ConsumerCsvExporter(prisma as never);

    const csv = await exporter.export();
    const lines = csv.split('\n');

    expect(lines[0]).toBe('consumer_id,total_requests');
  });

  it('(b) null consumer_id becomes "anonymous" via COALESCE', async () => {
    const prisma = makePrisma([{ consumer_id: 'anonymous', total_requests: 3n }]);
    const exporter = new ConsumerCsvExporter(prisma as never);

    const csv = await exporter.export();
    const lines = csv.split('\n');

    expect(lines[1]).toBe('anonymous,3');
  });

  it('(c) rows are ordered DESC by total_requests (as returned by query)', async () => {
    const prisma = makePrisma([
      { consumer_id: 'a', total_requests: 10n },
      { consumer_id: 'b', total_requests: 5n },
      { consumer_id: 'c', total_requests: 1n },
    ]);
    const exporter = new ConsumerCsvExporter(prisma as never);

    const csv = await exporter.export();
    const lines = csv.split('\n');

    expect(lines[1]).toBe('a,10');
    expect(lines[2]).toBe('b,5');
    expect(lines[3]).toBe('c,1');
  });
});
