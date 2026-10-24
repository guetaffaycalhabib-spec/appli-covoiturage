import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp, setupOpenApi } from './bootstrap';
import { loadConfig } from './config/app-config';

async function main() {
  const config = loadConfig();
  const app = configureApp(await NestFactory.create(AppModule.forRoot({ config })));
  setupOpenApi(app);
  await app.listen(config.port);
}

void main();
