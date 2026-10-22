import { applyDecorators } from '@nestjs/common';
import { IsString, Matches } from 'class-validator';

/**
 * Record id. Seeded rows keep their source slugs ("univ_mit", "prog_gmu_phd"),
 * rows created through the API get UUIDs — both match this.
 */
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function IsId(opts: { each?: boolean } = {}) {
  return applyDecorators(IsString(opts), Matches(ID_PATTERN, { ...opts, message: '$property must be a valid id' }));
}
