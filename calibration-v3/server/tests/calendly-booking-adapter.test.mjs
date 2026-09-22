import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCalendlyBooking } from '../calendly-booking-normalizer.mjs';

test('produces Production Booking Adapter-compatible payload', () => {
  const result = normalizeCalendlyBooking({
    consultant_id: 'consultant_real_001',
    event: {
      uri: 'https://api.calendly.com/scheduled_events/abc123',
      start_time: '2026-09-23T13:00:00Z'
    },
    invitee: {
      uri: 'https://api.calendly.com/scheduled_events/abc123/invitees/inv456',
      email: 'alex@noota.io',
      name: 'Alexandre Duffaut',
      questions_and_answers: [{
        question: 'Please share anything that will help prepare for our meeting.',
        answer: 'We are expanding enterprise sales and want to prioritize security work.\nnoota.io',
        position: 0
      }]
    }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    Object.keys(result.booking).sort(),
    [
      'booking_text',
      'calendly_event_uri',
      'calendly_invitee_uri',
      'company',
      'consultant_id',
      'domain',
      'meeting_source',
      'meeting_time',
      'opportunity_id',
      'prospect_email',
      'prospect_first_name',
      'prospect_role'
    ].sort()
  );
  assert.equal(result.booking.meeting_source, 'CALENDLY');
  assert.equal(result.booking.opportunity_id, 'calendly_inv456');
});
