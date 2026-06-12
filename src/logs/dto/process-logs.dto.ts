import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ProcessLogsDto {
  @ApiProperty({ example: '/var/log/gateway/access.ndjson' })
  @IsString()
  filePath!: string;
}
