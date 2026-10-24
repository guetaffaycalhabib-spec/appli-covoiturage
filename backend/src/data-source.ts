import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadConfig } from './config/app-config';
import { MIGRATIONS } from './migrations';

/** Source de données pour la CLI TypeORM (génération et exécution des migrations). */
export default new DataSource({
  type: 'postgres',
  url: loadConfig().databaseUrl,
  entities: [__dirname + '/modules/**/*.entit{y,ies}.{ts,js}'],
  migrations: MIGRATIONS,
});
