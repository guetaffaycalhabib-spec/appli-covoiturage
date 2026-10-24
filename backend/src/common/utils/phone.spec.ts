import { normalizeAlgerianMobile } from './phone';

describe('normalizeAlgerianMobile', () => {
  it.each([
    ['0555123456', '+213555123456'],
    ['+213 661 23 45 67', '+213661234567'],
    ['00213771234567', '+213771234567'],
  ])('%s → %s', (input, expected) => expect(normalizeAlgerianMobile(input)).toBe(expected));

  it.each(['0212345678', '+33612345678', '05551234', 'abc'])('rejette %s', (input) =>
    expect(normalizeAlgerianMobile(input)).toBeNull(),
  );
});
