import { Inject, Injectable } from '@nestjs/common';
import type { IFailureRepository } from '../repositories/failure.repository.interface';
import { FAILURE_REPOSITORY } from '../repositories/failure.repository.interface';
import type { ILogRepository } from '../repositories/log.repository.interface';
import { LOG_REPOSITORY } from '../repositories/log.repository.interface';
import { sha256 } from '../../common/hash.util';
import type { ProcessResult } from '../interfaces/process-result.interface';
import { LogParserService } from './log-parser.service';
import { LogReaderService } from './log-reader.service';

@Injectable()
export class LogProcessorService {
  constructor(
    private readonly reader: LogReaderService,
    private readonly parser: LogParserService,
    @Inject(LOG_REPOSITORY) private readonly logRepository: ILogRepository,
    @Inject(FAILURE_REPOSITORY)
    private readonly failureRepository: IFailureRepository,
  ) {}

  async process(filePath: string): Promise<ProcessResult> {
    const start = Date.now();
    let totalLines = 0;
    let inserted = 0;
    let failed = 0;

    for await (const rawLine of this.reader.readLines(filePath)) {
      totalLines++;
      const lineHash = sha256(rawLine);

      let entry;
      try {
        entry = this.parser.parse(rawLine);
      } catch (err) {
        failed++;
        await this.failureRepository.save({
          lineHash,
          rawLine,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        continue;
      }

      try {
        const affectedRows = await this.logRepository.insert(entry);
        if (affectedRows === 1) {
          inserted++;
        }
      } catch (err) {
        failed++;
        await this.failureRepository.save({
          lineHash: entry.line_hash,
          rawLine,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      inserted,
      skipped: totalLines - inserted - failed,
      failed,
      durationMs: Date.now() - start,
    };
  }
}
