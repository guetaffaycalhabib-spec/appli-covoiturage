import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Page, PageQuery, paginate } from '../../common/db/pagination';
import { Notification } from './notification.entity';

/**
 * Notifications dans l'application (persistées) ; l'envoi push (Firebase Cloud Messaging) se branche
 * ici à partir de la même source, pour que l'historique et le push ne divergent pas.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(@InjectRepository(Notification) private readonly notifications: Repository<Notification>) {}

  async notify(userId: string, type: string, payload: Record<string, unknown> = {}): Promise<void> {
    await this.notifications.insert({ userId, type, payload } as QueryDeepPartialEntity<Notification>);
    this.logger.debug(`push ${type} → ${userId}`);
  }

  async notifyMany(userIds: string[], type: string, payload: Record<string, unknown> = {}): Promise<void> {
    if (userIds.length === 0) return;
    await this.notifications.insert(userIds.map((userId) => ({ userId, type, payload }) as QueryDeepPartialEntity<Notification>));
  }

  list(userId: string, query: PageQuery): Promise<Page<Notification>> {
    return paginate(this.notifications.createQueryBuilder('n').where('n.userId = :userId', { userId }), query);
  }

  async markRead(userId: string, id?: string): Promise<void> {
    await this.notifications.update(id ? { id, userId } : { userId, readAt: IsNull() }, { readAt: new Date() });
  }
}
