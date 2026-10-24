import { ALGER, CHLEF, CONSTANTINE, dzDay, Harness, inDays, nextPhone, ORAN } from './harness';

/**
 * Critères d'acceptation de la version 1 (cahier des charges 18.5), démontrés sur une vraie base PostgreSQL.
 * Les numéros renvoient à la liste du cahier des charges.
 */
describe('Critères d’acceptation V1', () => {
  const h = new Harness();

  beforeAll(async () => {
    await h.start();
    // Le démarrage du trajet n'est possible que dans une fenêtre avant le départ ; élargie pour les tests.
    await h.setSetting('tracking.preDepartureWindowMinutes', 7 * 24 * 60);
  });
  afterAll(() => h.stop());

  describe('Authentification par OTP', () => {
    it('crée le compte au premier code valide, refuse un code faux et limite les renvois', async () => {
      const phone = '0661 23 45 67';
      const first = await h.post('/auth/otp/request', undefined, { phone }).expect(201);
      const bad = await h.post('/auth/otp/verify', undefined, { challengeId: first.body.challengeId, code: '000000' });
      expect(bad.status).toBe(401);
      expect(bad.body.error.code).toBe('OTP_INVALID');

      const ok = await h.post('/auth/otp/verify', undefined, { challengeId: first.body.challengeId, code: h.sms.lastCodeFor('+213661234567') }).expect(201);
      expect(ok.body.isNewUser).toBe(true);
      // Un code ne sert qu'une fois.
      await h.post('/auth/otp/verify', undefined, { challengeId: first.body.challengeId, code: h.sms.lastCodeFor('+213661234567') }).expect(401);

      await h.post('/auth/otp/request', undefined, { phone }).expect(201);
      await h.post('/auth/otp/request', undefined, { phone }).expect(201);
      const limited = await h.post('/auth/otp/request', undefined, { phone }).expect(429);
      expect(limited.body.error.code).toBe('OTP_RATE_LIMITED');
    });

    it('refuse un numéro non algérien et renouvelle le jeton par rotation', async () => {
      await h.post('/auth/otp/request', undefined, { phone: '+33612345678' }).expect(400);
      const phone = nextPhone();
      const req = await h.post('/auth/otp/request', undefined, { phone }).expect(201);
      const login = await h.post('/auth/otp/verify', undefined, { challengeId: req.body.challengeId, code: h.sms.lastCodeFor(phone) }).expect(201);
      const refreshed = await h.post('/auth/refresh', undefined, { refreshToken: login.body.refreshToken }).expect(201);
      expect(refreshed.body.accessToken).toBeDefined();
      await h.post('/auth/refresh', undefined, { refreshToken: login.body.refreshToken }).expect(401);
    });

    it('protège les routes et réserve l’administration au personnel', async () => {
      await h.get('/me').expect(401);
      const user = await h.user();
      const res = await h.get('/admin/kyc/queue', user).expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('2. Vérification du conducteur', () => {
    it('le vérificateur valide les pièces ; le badge apparaît ; la publication est débloquée', async () => {
      const s = await h.user({ firstName: 'Rachid' });
      const staff = await h.staff();
      let status = await h.get('/kyc/status', s).expect(200);
      expect(status.body).toMatchObject({ trustLevel: 0, verified: false });

      const id = await h.post('/kyc/documents', s, { type: 'national_id', fileRef: 'kyc/x/id.jpg' }).expect(201);
      const queue = await h.get('/admin/kyc/queue', staff).expect(200);
      expect(queue.body.map((d: { id: string }) => d.id)).toContain(id.body.id);
      // Date d'expiration et genre obligatoires pour la pièce d'identité.
      await h.post(`/admin/kyc/documents/${id.body.id}/approve`, staff, {}).expect(422);
      await h.post(`/admin/kyc/documents/${id.body.id}/approve`, staff, { expiresAt: '2031-01-01', gender: 'male' }).expect(201);
      await h.approveDoc(s, 'selfie');

      status = await h.get('/kyc/status', s).expect(200);
      expect(status.body).toMatchObject({ trustLevel: 1, verified: true });
      expect((await h.get(`/users/${s.id}`, staff).expect(200)).body.verified).toBe(true);

      const audit = await h.get(`/admin/audit?objectId=${id.body.id}`, staff).expect(200);
      expect(audit.body.items[0]).toMatchObject({ action: 'kyc.approve', actorId: staff.id });
    });

    it('un document rejeté reste « à corriger » avec motif, sans badge', async () => {
      const s = await h.user();
      const doc = await h.post('/kyc/documents', s, { type: 'selfie', fileRef: 'kyc/y/selfie.jpg' }).expect(201);
      await h.post(`/admin/kyc/documents/${doc.body.id}/reject`, await h.staff(), { reason: 'Photo floue' }).expect(201);
      const status = await h.get('/kyc/status', s).expect(200);
      expect(status.body.documents[0]).toMatchObject({ status: 'needs_correction', rejectionReason: 'Photo floue' });
      expect(status.body.verified).toBe(false);
    });

    it('un conducteur sans documents valides ne peut pas publier', async () => {
      const s = await h.verifiedUser('male');
      const vehicle = await h.post('/vehicles', s, { make: 'Dacia', model: 'Logan', year: 2018, color: 'Gris', plate: '22222 118 31', seats: 5 }).expect(201);
      await h.post('/me/driver-charter', s).expect(201);
      const res = await h.post('/trips', s, {
        vehicleId: vehicle.body.id, origin: ALGER, destination: ORAN, departureAt: inDays(2).toISOString(), seats: 3, pricePerSeat: 500,
      });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('DRIVER_NOT_VERIFIED');
      expect(res.body.error.details.missing).toEqual(expect.arrayContaining(['driving_license', 'insurance', 'approved_vehicle']));
    });
  });

  describe('3. Plafond de prix', () => {
    it('refuse toute publication ou modification au-dessus du plafond, y compris en base', async () => {
      const driver = await h.driver();
      const { priceCap } = await h.quote(3);
      const over = await h.post('/trips', driver, {
        vehicleId: driver.vehicleId, origin: ALGER, destination: ORAN, departureAt: inDays(3).toISOString(), seats: 3, pricePerSeat: priceCap + 10,
      });
      expect(over.status).toBe(422);
      expect(over.body.error).toMatchObject({ code: 'PRICE_ABOVE_CAP', details: { priceCap } });

      const trip = await h.publish(driver, { pricePerSeat: priceCap });
      const patch = await h.patch(`/trips/${trip.id}`, driver, { pricePerSeat: priceCap + 1 });
      expect(patch.body.error.code).toBe('PRICE_ABOVE_CAP');
      // Plus de places → plafond par place plus bas : le prix courant devient trop élevé.
      const morePlaces = await h.patch(`/trips/${trip.id}`, driver, { seats: 4 });
      expect(morePlaces.body.error.code).toBe('PRICE_ABOVE_CAP');

      await expect(h.ds.query(`UPDATE trips SET "pricePerSeat" = "priceCap" + 1 WHERE id = $1`, [trip.id])).rejects.toThrow(/trip_price_within_cap/);
    });

    it('applique le paramètre de prix de l’axe saisi par l’administration, versionné', async () => {
      const staff = await h.staff();
      const before = await h.quote(3);
      await h.post('/admin/pricing', staff, { fromWilaya: 31, toWilaya: 16, costPerKm: 12, tollAmount: 800, roundingStep: 10 }).expect(201);
      const after = await h.quote(3);
      expect(after.priceCap).toBeGreaterThan(before.priceCap);
      // Paramètre d'axe valable dans les deux sens.
      expect((await h.quote(3, ORAN, ALGER)).priceCap).toBe(after.priceCap);
    });
  });

  describe('1. Parcours complet passager / conducteur', () => {
    it('inscription, recherche, réservation, annulation, acceptation, démarrage, fin et notation réciproque', async () => {
      const driver = await h.driver();
      const trip = await h.publish(driver);
      const passenger = await h.user({ firstName: 'Lina' });

      const search = await h
        .get(`/trips/search?fromLat=${ALGER.lat}&fromLng=${ALGER.lng}&toLat=${ORAN.lat}&toLng=${ORAN.lng}&date=${dzDay(new Date(trip.departureAt))}`, passenger)
        .expect(200);
      const found = search.body.results.find((r: { id: string }) => r.id === trip.id);
      expect(found).toBeDefined();
      expect(found.driver).not.toHaveProperty('phone');
      expect(found.driver.verified).toBe(true);

      // Une première réservation, annulée sans frais longtemps avant le départ.
      const first = await h.post(`/trips/${trip.id}/bookings`, passenger, { seats: 1 }).expect(201);
      expect(first.body.status).toBe('pending');
      await h.post(`/bookings/${first.body.id}/cancel`, passenger, { reason: 'Changement de programme' }).expect(201);
      expect((await h.get(`/trips/${trip.id}`, passenger).expect(200)).body.seatsAvailable).toBe(3);

      const booking = await h.post(`/trips/${trip.id}/bookings`, passenger, { seats: 2 }).expect(201);
      const requests = await h.get('/notifications', driver).expect(200);
      expect(requests.body.items.map((n: { type: string }) => n.type)).toContain('booking.requested');
      // Le conducteur ne voit jamais le code de prise en charge.
      const driverView = await h.get(`/trips/${trip.id}/bookings`, driver).expect(200);
      expect(driverView.body[0]).not.toHaveProperty('pickupCode');

      await h.post(`/bookings/${booking.body.id}/accept`, driver).expect(201);
      const passengerView = await h.get(`/bookings/${booking.body.id}`, passenger).expect(200);
      expect(passengerView.body.status).toBe('confirmed');
      expect(passengerView.body.pickupCode).toMatch(/^\d{4}$/);
      expect(passengerView.body.vehicle.plate).toBe('12345 119 16');

      await h.post(`/trips/${trip.id}/start`, driver).expect(201);
      await h.post(`/bookings/${booking.body.id}/board`, driver, { code: passengerView.body.pickupCode }).expect(201);
      await h.post(`/trips/${trip.id}/complete`, driver).expect(201);
      await h.post(`/bookings/${booking.body.id}/dropoff`, passenger).expect(201);

      await h.post(`/bookings/${booking.body.id}/reviews`, passenger, { rating: 5, tags: ['punctuality', 'driving'], comment: 'Très bien' }).expect(201);
      await h.post(`/bookings/${booking.body.id}/reviews`, driver, { rating: 4, tags: ['respect'] }).expect(201);
      await h.post(`/bookings/${booking.body.id}/reviews`, passenger, { rating: 1 }).expect(409);

      const driverProfile = await h.get(`/users/${driver.id}`, passenger).expect(200);
      expect(driverProfile.body).toMatchObject({ ratingAverage: 5, ratingCount: 1 });
      const passengerProfile = await h.get(`/users/${passenger.id}`, driver).expect(200);
      expect(passengerProfile.body).toMatchObject({ ratingAverage: 4, ratingCount: 1 });
    });

    it('trouve un trajet sur un segment intermédiaire, au prix proratisé', async () => {
      const driver = await h.driver();
      const trip = await h.publish(driver, { stops: [CHLEF] });
      const passenger = await h.user();
      const search = await h
        .get(`/trips/search?fromLat=${ALGER.lat}&fromLng=${ALGER.lng}&toLat=${CHLEF.lat}&toLng=${CHLEF.lng}&date=${dzDay(new Date(trip.departureAt))}`, passenger)
        .expect(200);
      const found = search.body.results.find((r: { id: string }) => r.id === trip.id);
      expect(found.match.pricePerSeat).toBeLessThan(trip.pricePerSeat);
      // Sens inverse : pas de résultat.
      const reverse = await h
        .get(`/trips/search?fromLat=${CHLEF.lat}&fromLng=${CHLEF.lng}&toLat=${ALGER.lat}&toLng=${ALGER.lng}&date=${dzDay(new Date(trip.departureAt))}`, passenger)
        .expect(200);
      expect(reverse.body.results.find((r: { id: string }) => r.id === trip.id)).toBeUndefined();
    });

    it('sans résultat : enregistre la demande, propose des dates voisines et notifie l’alerte à la publication', async () => {
      const passenger = await h.user();
      const date = dzDay(inDays(5));
      const empty = await h
        .get(`/trips/search?fromLat=${CONSTANTINE.lat}&fromLng=${CONSTANTINE.lng}&toLat=${ALGER.lat}&toLng=${ALGER.lng}&date=${date}&fromWilaya=25&toWilaya=16`, passenger)
        .expect(200);
      expect(empty.body.results).toHaveLength(0);
      const demand = await h.get(`/admin/demand-map?date=${date}`, await h.staff()).expect(200);
      expect(demand.body).toEqual(expect.arrayContaining([expect.objectContaining({ fromWilaya: 25, toWilaya: 16, searches: 1 })]));

      await h.post('/trip-alerts', passenger, { origin: CONSTANTINE, destination: ALGER, date }).expect(201);
      const driver = await h.driver();
      const { suggestedPrice } = await h.quote(3, CONSTANTINE, ALGER);
      await h.post('/trips', driver, {
        vehicleId: driver.vehicleId, origin: CONSTANTINE, destination: ALGER, departureAt: inDays(5).toISOString(), seats: 3, pricePerSeat: suggestedPrice,
      }).expect(201);
      const notifications = await h.get('/notifications', passenger).expect(200);
      expect(notifications.body.items.map((n: { type: string }) => n.type)).toContain('trip_alert.matched');
    });

    it('empêche la surréservation sous réservations concurrentes', async () => {
      const driver = await h.driver();
      const trip = await h.publish(driver, { seats: 1, acceptanceMode: 'instant', pricePerSeat: (await h.quote(1)).suggestedPrice });
      const passengers = await Promise.all([h.user(), h.user(), h.user(), h.user()]);
      const results = await Promise.all(passengers.map((p) => h.post(`/trips/${trip.id}/bookings`, p, { seats: 1 })));
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409).map((r) => r.body.error.code)).toEqual(['NOT_ENOUGH_SEATS', 'NOT_ENOUGH_SEATS', 'NOT_ENOUGH_SEATS']);
      const detail = await h.get(`/trips/${trip.id}`, driver).expect(200);
      expect(detail.body).toMatchObject({ seatsAvailable: 0, status: 'full' });
    });

    it('les demandes sans réponse expirent et libèrent la place', async () => {
      const driver = await h.driver();
      const trip = await h.publish(driver);
      const passenger = await h.user();
      const booking = await h.post(`/trips/${trip.id}/bookings`, passenger, { seats: 1 }).expect(201);
      await h.ds.query(`UPDATE bookings SET "responseDeadline" = now() - interval '1 minute' WHERE id = $1`, [booking.body.id]);
      const { BookingsService } = await import('../src/modules/trips/bookings.service');
      await h.app.get(BookingsService).expirePending();
      expect((await h.get(`/bookings/${booking.body.id}`, passenger).expect(200)).body.status).toBe('expired');
      expect((await h.get(`/trips/${trip.id}`, passenger).expect(200)).body.seatsAvailable).toBe(3);
    });
  });

  describe('4. Mode « Entre femmes »', () => {
    it('est étanche : aucun profil masculin ne voit, ne réserve ni ne publie ces trajets', async () => {
      const man = await h.driver('male');
      const refused = await h.post('/trips', man, {
        vehicleId: man.vehicleId, origin: ALGER, destination: ORAN, departureAt: inDays(2).toISOString(), seats: 3, pricePerSeat: 500, womenOnly: true,
      });
      expect(refused.status).toBe(403);
      expect(refused.body.error.code).toBe('WOMEN_ONLY_NOT_ELIGIBLE');

      const woman = await h.driver('female');
      const trip = await h.publish(woman, { womenOnly: true, acceptanceMode: 'instant' });
      const date = dzDay(new Date(trip.departureAt));
      const query = `/trips/search?fromLat=${ALGER.lat}&fromLng=${ALGER.lng}&toLat=${ORAN.lat}&toLng=${ORAN.lng}&date=${date}`;

      const malePassenger = await h.verifiedUser('male');
      const unverifiedWoman = await h.user({ firstName: 'Imene', gender: 'female' });
      for (const viewer of [malePassenger, unverifiedWoman]) {
        const results = (await h.get(query, viewer).expect(200)).body.results;
        expect(results.find((r: { id: string }) => r.id === trip.id)).toBeUndefined();
        await h.get(`/trips/${trip.id}`, viewer).expect(404);
        await h.post(`/trips/${trip.id}/bookings`, viewer, { seats: 1 }).expect(404);
      }

      const femalePassenger = await h.verifiedUser('female');
      const results = (await h.get(query, femalePassenger).expect(200)).body.results;
      expect(results.find((r: { id: string }) => r.id === trip.id)).toBeDefined();
      await h.post(`/trips/${trip.id}/bookings`, femalePassenger, { seats: 1 }).expect(201);
    });

    it('le mode passagère limite les résultats aux conductrices vérifiées', async () => {
      const man = await h.driver('male');
      const manTrip = await h.publish(man);
      const passenger = await h.verifiedUser('female');
      await h.patch('/me', passenger, { womenOnlyMode: true }).expect(200);
      const results = (await h
        .get(`/trips/search?fromLat=${ALGER.lat}&fromLng=${ALGER.lng}&toLat=${ORAN.lat}&toLng=${ORAN.lng}&date=${dzDay(new Date(manTrip.departureAt))}`, passenger)
        .expect(200)).body.results;
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r: { driver: { id: string } }) => r.driver.id !== man.id)).toBe(true);

      const maleUser = await h.verifiedUser('male');
      expect((await h.patch('/me', maleUser, { womenOnlyMode: true })).body.error.code).toBe('WOMEN_ONLY_NOT_ELIGIBLE');
      // Le genre validé sur la pièce d'identité ne peut plus être modifié.
      expect((await h.patch('/me', maleUser, { gender: 'female' })).body.error.code).toBe('GENDER_LOCKED');
    });
  });

  describe('5 et 11. Suivi en direct, partage et SOS', () => {
    it('le passager suit le conducteur ; un proche suit sans compte ; le SOS prévient contacts et sécurité', async () => {
      const driver = await h.driver();
      const trip = await h.publish(driver, { acceptanceMode: 'instant' });
      const passenger = await h.user({ firstName: 'Meriem' });
      await h.put('/me/emergency-contacts', passenger, { contacts: [{ name: 'Maman', phone: '0770 11 22 33' }, { name: 'Frère', phone: '0550998877' }] }).expect(200);
      await h.post(`/trips/${trip.id}/bookings`, passenger, { seats: 1 }).expect(201);

      const outsider = await h.user();
      await h.get(`/trips/${trip.id}/position`, outsider).expect(404);

      await h.post(`/trips/${trip.id}/positions`, driver, { lat: 36.74, lng: 3.08 }).expect(204);
      const seen = await h.get(`/trips/${trip.id}/position`, passenger).expect(200);
      expect(seen.body.position).toMatchObject({ lat: 36.74, lng: 3.08 });
      expect(typeof seen.body.etaMinutes).toBe('number');

      const share = await h.post(`/trips/${trip.id}/share-links`, passenger).expect(201);
      const publicView = await h.get(`/public/tracking/${share.body.token}`).expect(200);
      expect(publicView.body).toMatchObject({ tripId: trip.id, position: { lat: 36.74, lng: 3.08 } });
      expect(publicView.body.driver).not.toHaveProperty('phone');

      const staff = await h.staff();
      const smsBefore = h.sms.sent.length;
      const started = Date.now();
      const sos = await h.post(`/trips/${trip.id}/sos`, passenger, { lat: 36.5, lng: 2.5 }).expect(201);
      expect(Date.now() - started).toBeLessThan(10_000);
      expect(sos.body.notifiedContacts).toBe(2);
      const sent = h.sms.sent.slice(smsBefore);
      expect(sent.map((m) => m.to).sort()).toEqual(['+213550998877', '+213770112233']);
      expect(sent[0].text).toContain(`http://localhost:3000/api/v1/public/tracking/${sos.body.shareToken}`);
      const staffNotifications = await h.get('/notifications', staff).expect(200);
      expect(staffNotifications.body.items[0]).toMatchObject({ type: 'safety.sos', payload: { incidentId: sos.body.incidentId } });
      const incidents = await h.get('/admin/incidents', staff).expect(200);
      expect(incidents.body[0]).toMatchObject({ id: sos.body.incidentId, severity: 'critical' });

      await h.post(`/trips/${trip.id}/sos`, outsider, {}).expect(403);
    });
  });

  describe('6. Code de prise en charge', () => {
    it('refuse et journalise un code erroné ; le trajet ne se termine pas sans traiter chaque passager', async () => {
      const driver = await h.driver();
      const trip = await h.publish(driver, { acceptanceMode: 'instant' });
      const passenger = await h.user();
      const booking = await h.post(`/trips/${trip.id}/bookings`, passenger, { seats: 1 }).expect(201);
      const { pickupCode } = (await h.get(`/bookings/${booking.body.id}`, passenger).expect(200)).body;

      await h.post(`/bookings/${booking.body.id}/board`, driver, { code: pickupCode }).expect(409);
      await h.post(`/trips/${trip.id}/start`, driver).expect(201);
      const wrong = pickupCode === '0000' ? '1111' : '0000';
      const failed = await h.post(`/bookings/${booking.body.id}/board`, driver, { code: wrong }).expect(422);
      expect(failed.body.error).toMatchObject({ code: 'PICKUP_CODE_INVALID', details: { remainingAttempts: 4 } });

      const audit = await h.get(`/admin/audit?objectId=${booking.body.id}&action=booking.pickup_code_failed`, await h.staff()).expect(200);
      expect(audit.body.items).toHaveLength(1);
      expect(audit.body.items[0].actorId).toBe(driver.id);

      const blocked = await h.post(`/trips/${trip.id}/complete`, driver).expect(409);
      expect(blocked.body.error).toMatchObject({ code: 'PASSENGERS_NOT_HANDLED', details: { bookingIds: [booking.body.id] } });

      await h.post(`/bookings/${booking.body.id}/board`, driver, { code: pickupCode }).expect(201);
      await h.post(`/trips/${trip.id}/complete`, driver).expect(201);
    });

    it('verrouille la prise en charge après trop de codes erronés', async () => {
      const driver = await h.driver();
      const trip = await h.publish(driver, { acceptanceMode: 'instant' });
      const passenger = await h.user();
      const booking = await h.post(`/trips/${trip.id}/bookings`, passenger, { seats: 1 }).expect(201);
      const { pickupCode } = (await h.get(`/bookings/${booking.body.id}`, passenger).expect(200)).body;
      const wrong = pickupCode === '0000' ? '1111' : '0000';
      await h.post(`/trips/${trip.id}/start`, driver).expect(201);
      for (let i = 0; i < 5; i++) await h.post(`/bookings/${booking.body.id}/board`, driver, { code: wrong }).expect(422);
      const locked = await h.post(`/bookings/${booking.body.id}/board`, driver, { code: pickupCode }).expect(423);
      expect(locked.body.error.code).toBe('PICKUP_CODE_LOCKED');
    });
  });

  describe('7. Messagerie masquée', () => {
    it('masque téléphones, e-mails et liens avant la fin du trajet ; aucun numéro réel n’est exposé', async () => {
      const driver = await h.driver();
      const trip = await h.publish(driver, { acceptanceMode: 'instant' });
      const passenger = await h.user();
      const booking = await h.post(`/trips/${trip.id}/bookings`, passenger, { seats: 1 }).expect(201);

      const sent = await h.post(`/bookings/${booking.body.id}/messages`, passenger, { body: 'Appelle-moi au 0555 12 34 56 ou karim@mail.com' }).expect(201);
      expect(sent.body.masked).toBe(true);
      expect(sent.body.body).not.toMatch(/0555|karim@mail\.com/);
      await h.post(`/bookings/${booking.body.id}/messages`, driver, { body: "J'arrive, je suis devant le kiosque" }).expect(201);

      const thread = await h.get(`/bookings/${booking.body.id}/messages`, driver).expect(200);
      expect(thread.body).toHaveLength(2);
      expect(JSON.stringify(thread.body)).not.toContain('0555');

      const raw = JSON.stringify([
        (await h.get(`/bookings/${booking.body.id}`, passenger)).body,
        (await h.get(`/bookings/${booking.body.id}`, driver)).body,
        (await h.get(`/trips/${trip.id}/bookings`, driver)).body,
        (await h.get(`/trips/${trip.id}`, passenger)).body,
      ]);
      expect(raw).not.toContain(driver.phone);
      expect(raw).not.toContain(passenger.phone);

      const outsider = await h.user();
      await h.post(`/bookings/${booking.body.id}/messages`, outsider, { body: 'Bonjour' }).expect(404);
    });
  });

  describe('8. Portefeuille et grand livre', () => {
    it('séquestre, remboursement avec frais, libération à la fin : écritures équilibrées et rapprochement sans écart', async () => {
      const staff = await h.staff();
      await h.setSetting('commission.percent', 10);
      const driver = await h.driver();
      const trip = await h.publish(driver, { acceptanceMode: 'instant', departureAt: new Date(Date.now() + 6 * 3_600_000).toISOString() });
      const passenger = await h.user();
      const lateCanceller = await h.user();

      await h.post(`/admin/wallets/${passenger.id}/top-ups`, staff, { amount: 10_000 }).set('Idempotency-Key', `t-${passenger.id}`).expect(201);
      // Rejouer la même recharge (coupure réseau) ne crédite pas deux fois.
      await h.post(`/admin/wallets/${passenger.id}/top-ups`, staff, { amount: 10_000 }).set('Idempotency-Key', `t-${passenger.id}`).expect(201);
      await h.post(`/admin/wallets/${lateCanceller.id}/top-ups`, staff, { amount: 5_000 }).set('Idempotency-Key', `t-${lateCanceller.id}`).expect(201);
      expect((await h.get('/wallet', passenger).expect(200)).body.balance).toBe(10_000);

      const poor = await h.user();
      const refused = await h.post(`/trips/${trip.id}/bookings`, poor, { seats: 1, paymentMethod: 'wallet' }).expect(422);
      expect(refused.body.error.code).toBe('INSUFFICIENT_BALANCE');

      const booking = await h.post(`/trips/${trip.id}/bookings`, passenger, { seats: 1, paymentMethod: 'wallet' }).set('Idempotency-Key', 'b-1').expect(201);
      const replay = await h.post(`/trips/${trip.id}/bookings`, passenger, { seats: 1, paymentMethod: 'wallet' }).set('Idempotency-Key', 'b-1').expect(201);
      expect(replay.body.id).toBe(booking.body.id);
      const price = booking.body.totalPrice as number;
      expect(booking.body.commissionAmount).toBe(Math.round(price / 10));
      expect((await h.get('/wallet', passenger).expect(200)).body.balance).toBe(10_000 - price);

      // Annulation tardive (départ dans moins de 24 h) : 20 % de frais, dont la moitié au conducteur.
      const late = await h.post(`/trips/${trip.id}/bookings`, lateCanceller, { seats: 1, paymentMethod: 'wallet' }).expect(201);
      await h.post(`/bookings/${late.body.id}/cancel`, lateCanceller, { reason: 'Imprévu' }).expect(201);
      const fee = Math.round(price * 0.2);
      expect((await h.get('/wallet', lateCanceller).expect(200)).body.balance).toBe(5_000 - fee);

      let reco = await h.get('/admin/ledger/reconciliation', staff).expect(200);
      expect(reco.body).toMatchObject({ balanced: true, escrowMatchesHeldBookings: true });
      expect(reco.body.escrowBalance).toBeGreaterThanOrEqual(price);

      const { pickupCode } = (await h.get(`/bookings/${booking.body.id}`, passenger).expect(200)).body;
      await h.post(`/trips/${trip.id}/start`, driver).expect(201);
      await h.post(`/bookings/${booking.body.id}/board`, driver, { code: pickupCode }).expect(201);
      await h.post(`/trips/${trip.id}/complete`, driver).expect(201);

      const driverWallet = (await h.get('/wallet', driver).expect(200)).body;
      expect(driverWallet.balance).toBe(price - booking.body.commissionAmount + Math.round(fee / 2));
      reco = await h.get('/admin/ledger/reconciliation', staff).expect(200);
      expect(reco.body).toMatchObject({ balanced: true, escrowMatchesHeldBookings: true });

      // Les écritures sont immuables.
      await expect(h.ds.query('UPDATE ledger_entries SET amount = amount + 1')).rejects.toThrow(/ajout seul/);
      await expect(h.ds.query('DELETE FROM audit_logs')).rejects.toThrow(/ajout seul/);
      await h.setSetting('commission.percent', 0);
    });

    it('espèces : la commission est débitée du portefeuille du conducteur, qui doit recharger sous le seuil', async () => {
      await h.setSetting('commission.percent', 10);
      await h.setSetting('wallet.minDriverBalanceToPublish', 0);
      const driver = await h.driver();
      const trip = await h.publish(driver, { acceptanceMode: 'instant' });
      const passenger = await h.user();
      const booking = await h.post(`/trips/${trip.id}/bookings`, passenger, { seats: 1 }).expect(201);
      expect(booking.body.paymentStatus).toBe('cash_due');
      const { pickupCode } = (await h.get(`/bookings/${booking.body.id}`, passenger).expect(200)).body;
      await h.post(`/trips/${trip.id}/start`, driver).expect(201);
      await h.post(`/bookings/${booking.body.id}/board`, driver, { code: pickupCode }).expect(201);
      await h.post(`/trips/${trip.id}/complete`, driver).expect(201);

      expect((await h.get('/wallet', driver).expect(200)).body.balance).toBe(-booking.body.commissionAmount);
      const blocked = await h.post('/trips', driver, {
        vehicleId: driver.vehicleId, origin: ALGER, destination: ORAN, departureAt: inDays(4).toISOString(), seats: 3, pricePerSeat: 500,
      });
      expect(blocked.body.error.code).toBe('WALLET_TOP_UP_REQUIRED');
      await h.setSetting('commission.percent', 0);
      await h.setSetting('wallet.minDriverBalanceToPublish', -2000);
    });
  });

  describe('Annulations et sanctions', () => {
    it('le conducteur qui annule : passagers remboursés et notifiés, score de fiabilité réduit', async () => {
      const staff = await h.staff();
      const driver = await h.driver();
      const trip = await h.publish(driver, { acceptanceMode: 'instant' });
      const passenger = await h.user();
      await h.post(`/admin/wallets/${passenger.id}/top-ups`, staff, { amount: 3_000 }).set('Idempotency-Key', `c-${passenger.id}`).expect(201);
      await h.post(`/trips/${trip.id}/bookings`, passenger, { seats: 1, paymentMethod: 'wallet' }).expect(201);

      await h.post(`/trips/${trip.id}/cancel`, driver, { reason: 'Panne' }).expect(201);
      expect((await h.get('/wallet', passenger).expect(200)).body.balance).toBe(3_000);
      const notif = (await h.get('/notifications', passenger).expect(200)).body.items[0];
      expect(notif).toMatchObject({ type: 'trip.cancelled_by_driver', payload: { tripId: trip.id } });
      expect((await h.get('/me', driver).expect(200)).body.reliabilityScore).toBe(90);
    });

    it('un compte suspendu ne peut plus réserver mais garde son historique', async () => {
      const driver = await h.driver();
      const trip = await h.publish(driver);
      const passenger = await h.user();
      await h.post(`/admin/users/${passenger.id}/suspend`, await h.staff(), { reason: 'Fraude suspectée' }).expect(201);
      const res = await h.post(`/trips/${trip.id}/bookings`, passenger, { seats: 1 }).expect(403);
      expect(res.body.error.code).toBe('ACCOUNT_NOT_ACTIVE');
      await h.get('/bookings', passenger).expect(200);
    });

    it('suppression de compte : refusée tant qu’une réservation est active, puis anonymisation', async () => {
      const driver = await h.driver();
      const trip = await h.publish(driver);
      const passenger = await h.user();
      const booking = await h.post(`/trips/${trip.id}/bookings`, passenger, { seats: 1 }).expect(201);
      const refused = await h.http().delete('/api/v1/me').set('Authorization', `Bearer ${passenger.token}`).expect(409);
      expect(refused.body.error.code).toBe('ACTIVE_COMMITMENTS');
      await h.post(`/bookings/${booking.body.id}/cancel`, passenger, { reason: 'Je pars plus tôt' }).expect(201);
      await h.http().delete('/api/v1/me').set('Authorization', `Bearer ${passenger.token}`).expect(204);

      const profile = await h.get(`/users/${passenger.id}`, driver).expect(200);
      expect(profile.body).toMatchObject({ firstName: null, lastInitial: null });
      // Le numéro est libéré : une nouvelle inscription crée un compte distinct.
      const again = await h.login(passenger.phone);
      expect(again.id).not.toBe(passenger.id);
    });

    it('le blocage mutuel empêche tout appariement', async () => {
      const driver = await h.driver();
      const trip = await h.publish(driver);
      const passenger = await h.user();
      await h.post(`/me/blocks/${passenger.id}`, driver).expect(204);
      await h.get(`/trips/${trip.id}`, passenger).expect(404);
      await h.post(`/trips/${trip.id}/bookings`, passenger, { seats: 1 }).expect(404);
    });
  });
});
