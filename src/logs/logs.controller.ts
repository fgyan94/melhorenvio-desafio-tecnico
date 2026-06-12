import { Body, Controller, HttpCode, Post, Res } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import { ExportLogsDto } from './dto/export-logs.dto';
import { ProcessLogsDto } from './dto/process-logs.dto';
import { ProcessResultDto } from './dto/process-result.dto';
import { ExporterFactory } from './factories/exporter.factory';
import type { ProcessResult } from './interfaces/process-result.interface';
import { LogProcessorService } from './services/log-processor.service';

@Controller('logs')
export class LogsController {
  constructor(
    private readonly processor: LogProcessorService,
    private readonly exporterFactory: ExporterFactory,
  ) {}

  @Post('process')
  @HttpCode(200)
  @ApiOperation({ summary: 'Process a NDJSON log file and persist records' })
  @ApiBody({ type: ProcessLogsDto })
  @ApiResponse({
    status: 200,
    type: ProcessResultDto,
    description: 'Returns inserted/skipped/failed counters and duration',
  })
  async process(@Body() dto: ProcessLogsDto): Promise<ProcessResult> {
    return this.processor.process(dto.filePath);
  }

  @Post('export')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Export a CSV report by type (consumer | service | latency)',
  })
  @ApiBody({ type: ExportLogsDto })
  @ApiResponse({
    status: 200,
    description: 'CSV file download',
    content: { 'text/csv': {} },
  })
  async export(
    @Body() dto: ExportLogsDto,
    @Res() res: Response,
  ): Promise<void> {
    const exporter = this.exporterFactory.create(dto.type);
    const csv = await exporter.export();
    const timestamp = Date.now();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${dto.type}_${timestamp}.csv"`,
    );
    res.send(csv);
  }
}
