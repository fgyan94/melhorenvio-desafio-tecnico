import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MySqlContainer } from '@testcontainers/mysql';
import type { StartedMySqlContainer } from '@testcontainers/mysql';
import { execSync } from 'child_process';
import * as path from 'path';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

const FIXTURE = path.join(__dirname, 'fixtures', 'sample-logs.ndjson');
const SOLUTION_ROOT = path.join(__dirname, '..');

describe('LogsController (e2e)', () => {
  let container: StartedMySqlContainer;
  let app: INestApplication<App>;

  beforeAll(async () => {
    container = await new MySqlContainer('mysql:8')
      .withDatabase('gateway_logs')
      .withUsername('appuser')
      .withUserPassword('apppassword')
      .start();

    const dbUrl = `mysql://appuser:apppassword@${container.getHost()}:${container.getMappedPort(3306)}/gateway_logs`;
    process.env.DATABASE_URL = dbUrl;

    execSync('npx prisma migrate deploy', {
      cwd: SOLUTION_ROOT,
      env: { ...process.env, DATABASE_URL: dbUrl },
      stdio: 'pipe',
    });

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  it('1st run: inserted=7, skipped=2, failed=1, durationMs>0', async () => {
    const res = await request(app.getHttpServer())
      .post('/logs/process')
      .send({ filePath: FIXTURE })
      .expect(200);

    expect(res.body.inserted).toBe(7);
    expect(res.body.skipped).toBe(2);
    expect(res.body.failed).toBe(1);
    expect(res.body.durationMs).toBeGreaterThan(0);
  });

  it('2nd run (idempotency): inserted=0, skipped=9, failed=1', async () => {
    const res = await request(app.getHttpServer())
      .post('/logs/process')
      .send({ filePath: FIXTURE })
      .expect(200);

    expect(res.body.inserted).toBe(0);
    expect(res.body.skipped).toBe(9);
    expect(res.body.failed).toBe(1);
  });

  it('export consumer: 200, content-type text/csv, correct header', async () => {
    const res = await request(app.getHttpServer())
      .post('/logs/export')
      .send({ type: 'consumer' })
      .expect(200);

    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('consumer_id,total_requests');
  });

  it('export service: 200, content-type text/csv, correct header', async () => {
    const res = await request(app.getHttpServer())
      .post('/logs/export')
      .send({ type: 'service' })
      .expect(200);

    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('service_name,total_requests');
  });

  it('export latency: 200, content-type text/csv, correct header', async () => {
    const res = await request(app.getHttpServer())
      .post('/logs/export')
      .send({ type: 'latency' })
      .expect(200);

    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('service_name,avg_proxy_ms,avg_gateway_ms,avg_request_ms');
  });
});
