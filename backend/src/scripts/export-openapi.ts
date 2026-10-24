import 'reflect-metadata';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { configureApp, setupOpenApi } from '../bootstrap';
import { loadConfig } from '../config/app-config';

/** Exporte le contrat OpenAPI sans base de données (mode aperçu : aucun fournisseur n'est instancié). */
async function main() {
  const app = configureApp(await NestFactory.create(AppModule.forRoot({ config: loadConfig() }), { preview: true, logger: false }));
  const document = setupOpenApi(app);
  const out = resolve(process.argv[2] ?? 'openapi.json');
  writeFileSync(out, JSON.stringify(document, null, 2) + '\n');
  console.log(`OpenAPI écrit dans ${out}`);
  await app.close();
}

void main();
