import { Gender, User } from '../users/user.entities';

/** Seules les femmes au profil vérifié voient et réservent les annonces « Entre femmes » (11.1). */
export const isVerifiedWoman = (user: Pick<User, 'gender' | 'trustLevel'>) => user.gender === Gender.FEMALE && user.trustLevel >= 1;
