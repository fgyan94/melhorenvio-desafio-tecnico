import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ProcessLogsDto {
  @ApiProperty({ example: '/data/logs/logs.txt' })
  @IsString()
  filePath!: string;
}
