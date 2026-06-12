import { LogEntrySchema } from './log-entry.schema';

const VALID_PAYLOAD = {
  request: {
    method: 'GET',
    uri: '/',
    url: 'http://yost.com',
    size: 174,
    querystring: [],
    headers: { accept: '*/*', host: 'yost.com' },
  },
  upstream_uri: '/',
  response: {
    status: 500,
    size: 878,
    headers: { 'Content-Type': 'application/json' },
  },
  authenticated_entity: {
    consumer_id: { uuid: '72b34d31-4c14-3bae-9cc6-516a0939c9d6' },
  },
  route: { id: '0636a119-b7ee-3828-ae83-5f7ebbb99831' },
  service: { id: 'c3e86413-648a-3552-90c3-b13491ee07d6', name: 'ritchie' },
  latencies: { proxy: 1836, gateway: 8, request: 1058 },
  client_ip: '75.241.168.121',
  started_at: 1566660387,
};

describe('LogEntrySchema', () => {
  it('(a) accepts a complete valid payload', () => {
    const result = LogEntrySchema.safeParse(VALID_PAYLOAD);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.authenticated_entity?.consumer_id?.uuid).toBe(
        '72b34d31-4c14-3bae-9cc6-516a0939c9d6',
      );
      expect(result.data.started_at).toBe(1566660387);
      expect(result.data.service?.name).toBe('ritchie');
    }
  });

  it('(a) accepts querystring as array []', () => {
    const result = LogEntrySchema.safeParse(VALID_PAYLOAD);
    expect(result.success).toBe(true);
  });

  it('(a) accepts querystring as object {}', () => {
    const result = LogEntrySchema.safeParse({
      ...VALID_PAYLOAD,
      request: { ...VALID_PAYLOAD.request, querystring: {} },
    });
    expect(result.success).toBe(true);
  });

  it('(b) payload with missing fields results in undefined without error', () => {
    const result = LogEntrySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.request).toBeUndefined();
      expect(result.data.authenticated_entity).toBeUndefined();
      expect(result.data.started_at).toBeUndefined();
    }
  });

  it('(b) partial payload leaves missing nested fields as undefined', () => {
    const result = LogEntrySchema.safeParse({ service: { name: 'myservice' } });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.service?.id).toBeUndefined();
      expect(result.data.latencies).toBeUndefined();
    }
  });

  it('(c) JSON.parse throws SyntaxError for invalid JSON before Zod is invoked', () => {
    expect(() => JSON.parse('{invalid json')).toThrow(SyntaxError);
  });
});
