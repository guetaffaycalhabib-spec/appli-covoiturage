export enum StaffRole {
  SUPPORT = 'support',
  KYC_VERIFIER = 'kyc_verifier',
  ADMIN = 'admin',
  FINANCE = 'finance',
  MARKETING = 'marketing',
}

export interface AuthUser {
  id: string;
  staffRoles: StaffRole[];
}

export interface AccessTokenPayload {
  sub: string;
  staffRoles: StaffRole[];
  typ: 'access';
}
