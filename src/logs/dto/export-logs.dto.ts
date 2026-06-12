import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import type { ExportType } from '../exporters/csv-exporter.interface';

export class ExportLogsDto {
  @ApiProperty({ enum: ['consumer', 'service', 'latency'] })
  @IsEnum(['consumer', 'service', 'latency'])
  type!: ExportType;
}
