import { LogProcessorService } from './log-processor.service';
import { MappedLogEntry } from '../repositories/log.repository.interface';

const ENTRY: MappedLogEntry = {
  line_hash: 'a'.repeat(64),
  consumer_id: null,
  service_id: null,
  service_name: null,
  route_id: null,
  request_method: 'GET',
  request_uri: '/',
  request_url: null,
  request_size: null,
  request_querystring: null,
  response_status: 200,
  response_size: null,
  upstream_uri: null,
  client_ip: null,
  latency_proxy: null,
  latency_gateway: null,
  latency_request: null,
  created_at: null,
};

function makeReader(lines: string[]) {
  return {
    readLines: jest.fn().mockImplementation(async function* () {
      for (const line of lines) yield line;
    }),
  };
}

function makeParser(behaviour: ('ok' | 'fail')[]): { parse: jest.Mock } {
  let callCount = 0;
  return {
    parse: jest.fn().mockImplementation(() => {
      const b = behaviour[callCount++] ?? 'ok';
      if (b === 'fail') throw new Error('parse error');
      return ENTRY;
    }),
  };
}

function makeLogRepo(affectedRowsSequence: number[]) {
  let callCount = 0;
  return {
    insert: jest.fn().mockImplementation(async () => {
      return affectedRowsSequence[callCount++] ?? 1;
    }),
  };
}

function makeFailureRepo() {
  return { save: jest.fn().mockResolvedValue(undefined) };
}

function buildService(
  reader: ReturnType<typeof makeReader>,
  parser: ReturnType<typeof makeParser>,
  logRepo: ReturnType<typeof makeLogRepo>,
  failureRepo: ReturnType<typeof makeFailureRepo>,
) {
  return new LogProcessorService(reader, parser, logRepo, failureRepo);
}

describe('LogProcessorService', () => {
  it('(a) returns correct counters for a mixed scenario (inserts, duplicates, failures)', async () => {
    // 5 lines: 3 inserted, 1 duplicate (skipped), 1 parse failure
    const reader = makeReader(['l1', 'l2', 'l3', 'l4', 'l5']);
    const parser = makeParser(['ok', 'ok', 'ok', 'ok', 'fail']);
    const logRepo = makeLogRepo([1, 1, 1, 0]);
    const failureRepo = makeFailureRepo();
    const service = buildService(reader, parser, logRepo, failureRepo);

    const result = await service.process('/any/path');

    expect(result.inserted).toBe(3);
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('(b) skipped = totalLines - inserted - failed', async () => {
    // 6 lines: 2 inserted, 2 duplicates, 2 failures
    const reader = makeReader(['l1', 'l2', 'l3', 'l4', 'l5', 'l6']);
    const parser = makeParser(['ok', 'ok', 'ok', 'ok', 'fail', 'fail']);
    const logRepo = makeLogRepo([1, 1, 0, 0]);
    const failureRepo = makeFailureRepo();
    const service = buildService(reader, parser, logRepo, failureRepo);

    const result = await service.process('/any/path');

    expect(result.inserted).toBe(2);
    expect(result.failed).toBe(2);
    expect(result.skipped).toBe(2); // 6 - 2 - 2
  });

  it('(c) parse failure does not interrupt the loop — remaining lines are processed', async () => {
    const reader = makeReader(['bad', 'good1', 'good2']);
    const parser = makeParser(['fail', 'ok', 'ok']);
    const logRepo = makeLogRepo([1, 1]);
    const failureRepo = makeFailureRepo();
    const service = buildService(reader, parser, logRepo, failureRepo);

    const result = await service.process('/any/path');

    expect(result.failed).toBe(1);
    expect(result.inserted).toBe(2);
    expect(logRepo.insert).toHaveBeenCalledTimes(2);
  });

  it('(d) insert failure does not interrupt the loop — remaining lines are processed', async () => {
    const reader = makeReader(['l1', 'l2', 'l3']);
    const parser = makeParser(['ok', 'ok', 'ok']);
    const logRepo = makeLogRepo([1]);
    logRepo.insert
      .mockResolvedValueOnce(1)
      .mockRejectedValueOnce(new Error('DB error'))
      .mockResolvedValueOnce(1);
    const failureRepo = makeFailureRepo();
    const service = buildService(reader, parser, logRepo, failureRepo);

    const result = await service.process('/any/path');

    expect(result.inserted).toBe(2);
    expect(result.failed).toBe(1);
    expect(failureRepo.save).toHaveBeenCalledTimes(1);
  });

  it('parse failure saves a non-empty lineHash to failure repository', async () => {
    const reader = makeReader(['bad line']);
    const parser = makeParser(['fail']);
    const logRepo = makeLogRepo([]);
    const failureRepo = makeFailureRepo();
    const service = buildService(reader, parser, logRepo, failureRepo);

    await service.process('/any/path');

    expect(failureRepo.save).toHaveBeenCalledTimes(1);
    const savedData = failureRepo.save.mock.calls[0][0];
    expect(savedData.lineHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
