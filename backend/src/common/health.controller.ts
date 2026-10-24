import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { Public } from './auth/decorators';

@ApiTags('Exploitation')
@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  /** Sonde de disponibilité : l'API répond et la base est joignable. */
  @Public()
  @Get()
  async check() {
    await this.dataSource.query('SELECT 1');
    return { status: 'ok' };
  }
}
