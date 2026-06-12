import { writeFileSync, unlinkSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { LogReaderService } from './log-reader.service';

async function collectLines(
  service: LogReaderService,
  filePath: string,
): Promise<string[]> {
  const lines: string[] = [];
  for await (const line of service.readLines(filePath)) {
    lines.push(line);
  }
  return lines;
}

describe('LogReaderService', () => {
  let service: LogReaderService;
  let tmpDir: string;

  beforeAll(() => {
    service = new LogReaderService();
    tmpDir = mkdtempSync(join(tmpdir(), 'log-reader-'));
  });

  it('(a) yields all non-empty lines from a fixture file', async () => {
    const filePath = join(tmpDir, 'fixture.txt');
    writeFileSync(filePath, 'line one\nline two\nline three\n');

    const lines = await collectLines(service, filePath);

    expect(lines).toEqual(['line one', 'line two', 'line three']);
    unlinkSync(filePath);
  });

  it('(a) skips blank lines', async () => {
    const filePath = join(tmpDir, 'blanks.txt');
    writeFileSync(filePath, 'first\n\n\nsecond\n');

    const lines = await collectLines(service, filePath);

    expect(lines).toEqual(['first', 'second']);
    unlinkSync(filePath);
  });

  it('(b) empty file emits no lines', async () => {
    const filePath = join(tmpDir, 'empty.txt');
    writeFileSync(filePath, '');

    const lines = await collectLines(service, filePath);

    expect(lines).toHaveLength(0);
    unlinkSync(filePath);
  });

  it('(c) non-existent file throws an error with a descriptive message', async () => {
    const filePath = join(tmpDir, 'does-not-exist.txt');

    await expect(collectLines(service, filePath)).rejects.toThrow(
      `Log file not found: ${filePath}`,
    );
  });
});
