import { LogParserService } from './log-parser.service';
import { sha256 } from '../../common/hash.util';

const REAL_LOG_LINE =
  '{"request":{"method":"GET","uri":"\\/","url":"http:\\/\\/yost.com","size":174,"querystring":[],"headers":{"accept":"*\\/*","host":"yost.com","user-agent":"curl\\/7.37.1"}},"upstream_uri":"\\/","response":{"status":500,"size":878,"headers":{"Content-Length":"197","via":"gateway\\/1.3.0","Connection":"close","access-control-allow-credentials":"true","Content-Type":"application\\/json","server":"nginx","access-control-allow-origin":"*"}},"authenticated_entity":{"consumer_id":{"uuid":"72b34d31-4c14-3bae-9cc6-516a0939c9d6"}},"route":{"created_at":1564823899,"hosts":"miller.com","id":"0636a119-b7ee-3828-ae83-5f7ebbb99831","methods":["GET","POST","PUT","DELETE","PATCH","OPTIONS","HEAD"],"paths":["\\/"],"preserve_host":false,"protocols":["http","https"],"regex_priority":0,"service":{"id":"c3e86413-648a-3552-90c3-b13491ee07d6"},"strip_path":true,"updated_at":1564823899},"service":{"connect_timeout":60000,"created_at":1563589483,"host":"ritchie.com","id":"c3e86413-648a-3552-90c3-b13491ee07d6","name":"ritchie","path":"\\/","port":80,"protocol":"http","read_timeout":60000,"retries":5,"updated_at":1563589483,"write_timeout":60000},"latencies":{"proxy":1836,"gateway":8,"request":1058},"client_ip":"75.241.168.121","started_at":1566660387}';

describe('LogParserService', () => {
  let service: LogParserService;

  beforeEach(() => {
    service = new LogParserService();
  });

  it('(a) parses a real log line with all fields mapped correctly', () => {
    const result = service.parse(REAL_LOG_LINE);

    expect(result.line_hash).toBe(sha256(REAL_LOG_LINE));
    expect(result.request_method).toBe('GET');
    expect(result.request_uri).toBe('/');
    expect(result.request_size).toBe(174);
    expect(result.response_status).toBe(500);
    expect(result.response_size).toBe(878);
    expect(result.service_id).toBe('c3e86413-648a-3552-90c3-b13491ee07d6');
    expect(result.service_name).toBe('ritchie');
    expect(result.route_id).toBe('0636a119-b7ee-3828-ae83-5f7ebbb99831');
    expect(result.latency_proxy).toBe(1836);
    expect(result.latency_gateway).toBe(8);
    expect(result.latency_request).toBe(1058);
    expect(result.client_ip).toBe('75.241.168.121');
    expect(result.upstream_uri).toBe('/');
    expect(result.request_querystring).toBe('[]');
  });

  it('(b) converts started_at (seconds) to a correct Date', () => {
    const result = service.parse(REAL_LOG_LINE);

    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.created_at?.getTime()).toBe(1566660387 * 1000);
  });

  it('(c) extracts consumer_id from nested authenticated_entity.consumer_id.uuid', () => {
    const result = service.parse(REAL_LOG_LINE);

    expect(result.consumer_id).toBe('72b34d31-4c14-3bae-9cc6-516a0939c9d6');
  });

  it('(d) missing fields result in null', () => {
    const minimal = JSON.stringify({ started_at: 1566660387 });
    const result = service.parse(minimal);

    expect(result.consumer_id).toBeNull();
    expect(result.service_name).toBeNull();
    expect(result.request_method).toBeNull();
    expect(result.response_status).toBeNull();
    expect(result.latency_proxy).toBeNull();
    expect(result.request_querystring).toBeNull();
  });

  it('(d) missing started_at results in null created_at', () => {
    const result = service.parse(JSON.stringify({}));
    expect(result.created_at).toBeNull();
  });

  it('(e) invalid JSON throws an error', () => {
    expect(() => service.parse('{invalid')).toThrow();
  });
});
