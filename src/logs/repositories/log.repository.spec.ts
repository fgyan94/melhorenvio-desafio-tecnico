import { LogRepository } from './log.repository';
import { MappedLogEntry } from './log.repository.interface';

const ENTRY: MappedLogEntry = {
  line_hash: 'abc123'.padEnd(64, '0'),
  consumer_id: '72b34d31-4c14-3bae-9cc6-516a0939c9d6',
  service_id: 'c3e86413-648a-3552-90c3-b13491ee07d6',
  service_name: 'ritchie',
  route_id: '0636a119-b7ee-3828-ae83-5f7ebbb99831',
  request_method: 'GET',
  request_uri: '/',
  request_url: 'http://yost.com',
  request_size: 174,
  request_querystring: '[]',
  response_status: 500,
  response_size: 878,
  upstream_uri: '/',
  client_ip: '75.241.168.121',
  latency_proxy: 1836,
  latency_gateway: 8,
  latency_request: 1058,
  created_at: new Date('2019-08-24T18:46:27.000Z'),
};

function makePrisma(affectedRows: number) {
  return { $executeRaw: jest.fn().mockResolvedValue(affectedRows) };
}

describe('LogRepository', () => {
  it('(a) calls $executeRaw and passes all mapped fields', async () => {
    const prisma = makePrisma(1);
    const repo = new LogRepository(prisma as never);

    await repo.insert(ENTRY);

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    const callArg: TemplateStringsArray = prisma.$executeRaw.mock.calls[0][0];
    expect(callArg.join(' ')).toContain('INSERT IGNORE INTO gateway_logs');
  });

  it('(b) returns 1 (affectedRows) when the row is inserted', async () => {
    const prisma = makePrisma(1);
    const repo = new LogRepository(prisma as never);

    const result = await repo.insert(ENTRY);

    expect(result).toBe(1);
  });

  it('(c) returns 0 (affectedRows) when the row is ignored (duplicate)', async () => {
    const prisma = makePrisma(0);
    const repo = new LogRepository(prisma as never);

    const result = await repo.insert(ENTRY);

    expect(result).toBe(0);
  });
});
