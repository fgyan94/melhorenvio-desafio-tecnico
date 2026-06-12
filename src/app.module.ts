import { Module } from '@nestjs/common';
import { LogsModule } from './logs/logs.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, LogsModule],
})
export class AppModule {}
