import { Injectable } from '@nestjs/common';
import { createReadStream, existsSync } from 'fs';
import { createInterface } from 'readline';

@Injectable()
export class LogReaderService {
  async *readLines(filePath: string): AsyncGenerator<string> {
    if (!existsSync(filePath)) {
      throw new Error(`Log file not found: ${filePath}`);
    }

    const rl = createInterface({
      input: createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (line.trim().length > 0) {
        yield line;
      }
    }
  }
}
