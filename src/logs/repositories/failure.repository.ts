import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  FailureData,
  IFailureRepository,
} from './failure.repository.interface';

@Injectable()
export class FailureRepository implements IFailureRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(data: FailureData): Promise<void> {
    await this.prisma.gatewayLogFailure.create({
      data: {
        line_hash: data.lineHash,
        raw_line: data.rawLine,
        error_message: data.errorMessage,
      },
    });
  }
}
