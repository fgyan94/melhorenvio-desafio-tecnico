import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ExporterFactory } from './factories/exporter.factory';
import { LogsController } from './logs.controller';
import { FAILURE_REPOSITORY } from './repositories/failure.repository.interface';
import { FailureRepository } from './repositories/failure.repository';
import { LOG_REPOSITORY } from './repositories/log.repository.interface';
import { LogRepository } from './repositories/log.repository';
import { LogParserService } from './services/log-parser.service';
import { LogProcessorService } from './services/log-processor.service';
import { LogReaderService } from './services/log-reader.service';

@Module({
  imports: [PrismaModule],
  controllers: [LogsController],
  providers: [
    { provide: LOG_REPOSITORY, useClass: LogRepository },
    { provide: FAILURE_REPOSITORY, useClass: FailureRepository },
    LogReaderService,
    LogParserService,
    LogProcessorService,
    ExporterFactory,
  ],
})
export class LogsModule {}
