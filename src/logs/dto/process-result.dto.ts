import { ApiProperty } from '@nestjs/swagger';

export class ProcessResultDto {
  @ApiProperty({ example: 142, description: 'New lines inserted' })
  inserted!: number;

  @ApiProperty({
    example: 8,
    description: 'Duplicate lines skipped (already in DB)',
  })
  skipped!: number;

  @ApiProperty({ example: 2, description: 'Lines that failed parse or insert' })
  failed!: number;

  @ApiProperty({
    example: 317,
    description: 'Total processing time in milliseconds',
  })
  durationMs!: number;
}
