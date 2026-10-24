import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { DatabaseGuards } from './common/db/database-guards';
import { HealthController } from './common/health.controller';
import { HttpErrorFilter } from './common/http-exception.filter';
import { AppConfig, loadConfig } from './config/app-config';
import { ConfigModule } from './config/config.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { GeoModule } from './modules/geo/geo.module';
import { KycModule } from './modules/kyc/kyc.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { SafetyModule } from './modules/safety/safety.module';
import { SettingsModule } from './modules/settings/settings.module';
import { TripsModule } from './modules/trips/trips.module';
import { UsersModule } from './modules/users/users.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';
import { MIGRATIONS } from './migrations';

export interface AppModuleOptions {
  config?: AppConfig;
  /** Désactive les tâches planifiées (tests). */
  disableScheduler?: boolean;
  /** Désactive la limitation de débit par adresse réseau (tests, où toutes les requêtes viennent de la même adresse). */
  disableThrottling?: boolean;
}

export class AppModule {
  static forRoot(options: AppModuleOptions = {}) {
    const config = options.config ?? loadConfig();
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: config.databaseUrl,
          autoLoadEntities: true,
          synchronize: config.dbSynchronize,
          migrations: MIGRATIONS,
          migrationsRun: config.dbRunMigrations && !config.dbSynchronize,
        }),
        JwtModule.register({ global: true }),
        EventEmitterModule.forRoot(),
        ...(options.disableScheduler ? [] : [ScheduleModule.forRoot()]),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
        SettingsModule,
        AuditModule,
        NotificationsModule,
        UsersModule,
        AuthModule,
        VehiclesModule,
        KycModule,
        GeoModule,
        LedgerModule,
        TripsModule,
        MessagingModule,
        ReviewsModule,
        SafetyModule,
        AdminModule,
      ],
      controllers: [HealthController],
      providers: [
        DatabaseGuards,
        ...(options.disableThrottling ? [] : [{ provide: APP_GUARD, useClass: ThrottlerGuard }]),
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_FILTER, useClass: HttpErrorFilter },
      ],
    };
  }
}

