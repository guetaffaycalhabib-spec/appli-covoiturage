import { filterInsults, maskContactDetails, MASK } from './text-masking';

describe('maskContactDetails', () => {
  it.each([
    'Appelle-moi au 0555 12 34 56',
    'mon numéro : +213 661-23-45-67',
    'whatsapp 00213771234567',
    'رقمي ٠٥٥٥١٢٣٤٥٦',
    'écris-moi sur karim.b@gmail.com',
    'karim (at) gmail (dot) com',
    'regarde www.exemple.dz',
    'https://wa.me/213555123456',
  ])('masque les coordonnées dans « %s »', (input) => {
    const result = maskContactDetails(input);
    expect(result.masked).toBe(true);
    expect(result.text).toContain(MASK);
    expect(result.text).not.toMatch(/\d{6,}/);
  });

  it('laisse intact un message sans coordonnées', () => {
    const result = maskContactDetails('Je suis devant le kiosque, départ à 8h30, 2 bagages');
    expect(result).toEqual({ text: 'Je suis devant le kiosque, départ à 8h30, 2 bagages', masked: false });
  });
});

describe('filterInsults', () => {
  it('masque les insultes de la liste', () => {
    expect(filterInsults('quel connard').text).toBe(`quel ${MASK}`);
  });
});
