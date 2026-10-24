import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

export class PageQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Pagination par curseur (cahier des charges 14.3), du plus récent au plus ancien,
 * sur le couple (createdAt, id) pour un ordre total et stable.
 */
export async function paginate<T extends ObjectLiteral & { id: string; createdAt: Date }>(
  qb: SelectQueryBuilder<T>,
  query: PageQuery,
): Promise<Page<T>> {
  const alias = qb.alias;
  const limit = query.limit ?? 20;
  if (query.cursor) {
    const [createdAt, id] = Buffer.from(query.cursor, 'base64url').toString().split('|');
    qb.andWhere(`(${alias}.createdAt, ${alias}.id) < (:cursorCreatedAt, :cursorId)`, {
      cursorCreatedAt: new Date(createdAt),
      cursorId: id,
    });
  }
  const rows = await qb
    .orderBy(`${alias}.createdAt`, 'DESC')
    .addOrderBy(`${alias}.id`, 'DESC')
    .take(limit + 1)
    .getMany();
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  const nextCursor =
    rows.length > limit && last ? Buffer.from(`${last.createdAt.toISOString()}|${last.id}`).toString('base64url') : null;
  return { items, nextCursor };
}
