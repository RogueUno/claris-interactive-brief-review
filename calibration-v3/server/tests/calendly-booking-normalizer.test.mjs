import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCalendlyBooking } from '../calendly-booking-normalizer.mjs';

const consultantId = 'consultant_pilot_001';

test('normalizes real-world Calendly answer with unlabeled domain', () => {
  const result = normalizeCalendlyBooking({
    consultant_id: consultantId,
    event: {
      uri: 'https://api.calendly.com/scheduled_events/595224c1-11cd-4194-b403-28f28e317b32',
      start_time: '2026-08-26T16:00:00Z'
    },
    invitee: {
      uri: 'https://api.calendly.com/scheduled_events/595224c1-11cd-4194-b403-28f28e317b32/invitees/aaf1e298-face-4cde-9e8b-4719ea665e6d',
      email: 'mehdi.medjahed@live.fr',
      name: 'Alexandre Duffaut',
      questions_and_answers: [{
        question: 'Please share anything that will help prepare for our meeting.',
        answer: "We're growing our enterprise customer base and want to make sure our security and compliance approach can keep up. I'd like to understand what we should prioritize over the next few months.\nnoota.io",
        position: 0
      }]
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.booking.prospect_first_name, 'Alexandre');
  assert.equal(result.booking.domain, 'https://noota.io');
  assert.equal(result.booking.company, 'Noota');
  assert.equal(result.provenance.domain, 'BOOKING_TEXT_DOMAIN');
  assert.equal(result.provenance.company, 'DOMAIN_LABEL');
});

test('prefers explicit company wording over domain-derived label', () => {
  const result = normalizeCalendlyBooking({
    consultant_id: consultantId,
    event: {
      uri: 'https://api.calendly.com/scheduled_events/b90cebf5-ba16-4ab4-8bc5-ee4d30614535',
      start_time: '2026-08-27T13:30:00Z'
    },
    invitee: {
      uri: 'https://api.calendly.com/scheduled_events/b90cebf5-ba16-4ab4-8bc5-ee4d30614535/invitees/722a7eb7-8d31-4eee-88f7-f2aba14e71af',
      email: 'person@example.net',
      name: 'Iranthi Gomes',
      questions_and_answers: [{
        question: 'Please share anything that will help prepare for our meeting.',
        answer: "My company is Serviceform,\nWe’re starting to work with larger enterprise customers and security/compliance requirements are becoming more important.\nserviceform.com",
        position: 0
      }]
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.booking.company, 'Serviceform');
  assert.equal(result.booking.domain, 'https://serviceform.com');
  assert.equal(result.provenance.company, 'BOOKING_TEXT_EXPLICIT');
});

test('uses non-free invitee email domain only as fallback', () => {
  const result = normalizeCalendlyBooking({
    consultant_id: consultantId,
    event: {
      uri: 'https://api.calendly.com/scheduled_events/example-event',
      start_time: '2026-09-23T13:00:00Z'
    },
    invitee: {
      uri: 'https://api.calendly.com/scheduled_events/example-event/invitees/example-invitee',
      email: 'alex@noota.io',
      name: 'Alexandre Duffaut',
      questions_and_answers: [{
        question: 'Please share anything that will help prepare for our meeting.',
        answer: 'We want to discuss our security priorities.',
        position: 0
      }]
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.booking.domain, 'https://noota.io');
  assert.equal(result.booking.company, 'Noota');
  assert.equal(result.provenance.domain, 'INVITEE_EMAIL_DOMAIN');
});

test('does not treat free email domain as company identity', () => {
  const result = normalizeCalendlyBooking({
    consultant_id: consultantId,
    event: {
      uri: 'https://api.calendly.com/scheduled_events/example-event',
      start_time: '2026-09-23T13:00:00Z'
    },
    invitee: {
      uri: 'https://api.calendly.com/scheduled_events/example-event/invitees/example-invitee',
      email: 'alex@gmail.com',
      name: 'Alex Example',
      questions_and_answers: [{
        question: 'Please share anything that will help prepare for our meeting.',
        answer: 'We want to discuss our security priorities.',
        position: 0
      }]
    }
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.missing.sort(), ['company', 'domain']);
  assert.equal(result.booking.domain, null);
});

test('supports explicit structured Calendly questions when present', () => {
  const result = normalizeCalendlyBooking({
    consultant_id: consultantId,
    event: {
      uri: 'https://api.calendly.com/scheduled_events/example-event',
      start_time: '2026-09-23T13:00:00Z'
    },
    invitee: {
      uri: 'https://api.calendly.com/scheduled_events/example-event/invitees/example-invitee',
      email: 'vp@example.com',
      name: 'Steve Example',
      questions_and_answers: [
        { question: 'Company', answer: 'Instructure', position: 0 },
        { question: 'Company website', answer: 'https://www.instructure.com', position: 1 },
        { question: 'Your role', answer: 'VP Engineering', position: 2 },
        { question: 'What would help us prepare?', answer: 'We want to audit API endpoints and OAuth token usage.', position: 3 }
      ]
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.booking.company, 'Instructure');
  assert.equal(result.booking.domain, 'https://instructure.com');
  assert.equal(result.booking.prospect_role, 'VP Engineering');
  assert.equal(result.provenance.company, 'QUESTION_COMPANY');
  assert.equal(result.provenance.domain, 'QUESTION_DOMAIN');
  assert.equal(result.provenance.role, 'QUESTION_ROLE');
});
