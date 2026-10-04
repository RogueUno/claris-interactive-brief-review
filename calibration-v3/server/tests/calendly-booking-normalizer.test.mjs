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


test('real two-question Calendly setup derives company from website, not URL as name', () => {
  const normalized = normalizeCalendlyBooking({
    consultant_id: consultantId,
    require_company_website_answer: true,
    event: {
      uri: 'https://api.calendly.com/scheduled_events/meeting-a12',
      start_time: '2026-10-09T16:00:00Z'
    },
    invitee: {
      uri: 'https://api.calendly.com/scheduled_events/meeting-a12/invitees/a12b34c5',
      email: 'robin@gmail.com',
      name: 'Robin Security',
      questions_and_answers: [
        { question: 'Company website', answer: 'https://www.acme-security.com/', position: 0 },
        { question: 'Please share anything that will help prepare for our meeting.',
          answer: 'We would like a security posture assessment.', position: 1 }
      ]
    }
  });
  assert.equal(normalized.ok, true);
  assert.equal(normalized.booking.company, 'Acme Security');
  assert.equal(normalized.booking.domain, 'https://acme-security.com');
  assert.equal(normalized.booking.opportunity_id, 'calendly_a12b34c5');
  assert.equal(normalized.provenance.company, 'DOMAIN_LABEL');
  assert.equal(normalized.provenance.domain, 'QUESTION_DOMAIN');
});

test('strict company website rejects email-domain and free-text domain fallback', () => {
  for(const answer of [
    [{ question: 'Please share anything that will help prepare for our meeting.',
      answer: 'Interested in your vCISO offering at acme-security.com.' }],
    [{ question: 'Company website', answer: 'not supplied' }]
  ]) {
    const value = normalizeCalendlyBooking({
      consultant_id: consultantId,
      require_company_website_answer: true,
      event: {
        uri: 'https://api.calendly.com/scheduled_events/meeting-b34',
        start_time: '2026-10-09T16:00:00Z'
      },
      invitee: {
        uri: 'https://api.calendly.com/scheduled_events/meeting-b34/invitees/b34c56d7',
        email: 'robin@acme-security.com',
        name: 'Robin Security', questions_and_answers: answer
      }
    });
    assert.equal(value.ok, false);
    assert.ok(value.missing.includes('company_website_answer'));
    assert.notEqual(value.provenance.domain, 'QUESTION_DOMAIN');
  }
});


test('strict Company website blocks private targets and embedded addresses', () => {
  const invalid = [
    'https://169.254.169.254/latest/meta-data',
    'http://127.0.0.1/internal',
    'https://private.local',
    'https://localhost',
    'https://something.internal',
    'https://example.test',
    'file://intranet.acme.com',
    'javascript:acme.com',
    'https://user:password@acme.com',
    'https://acme.com:8443',
    'check our website: acme.com',
    'https://acme.com an old one'
  ];
  for(const website of invalid) {
    const normalized = normalizeCalendlyBooking({
      consultant_id: consultantId,
      require_company_website_answer: true,
      event: {
        uri: 'https://api.calendly.com/scheduled_events/security-001',
        start_time: '2026-10-10T16:00:00Z'
      },
      invitee: {
        uri: 'https://api.calendly.com/scheduled_events/security-001/invitees/security-001',
        name: 'Robin Security',
        email: 'robin@acme.com',
        questions_and_answers: [{ question: 'Company website', answer: website }]
      }
    });
    assert.equal(normalized.ok, false, website);
    assert.equal(normalized.booking.domain, null, website);
    assert.equal(normalized.provenance.domain, null, website);
    assert.ok(normalized.missing.includes('company_website_answer'), website);
  }
});

test('strict Company website ignores personal website instead of claiming corporate identity', () => {
  const normalized = normalizeCalendlyBooking({
    consultant_id: consultantId,
    require_company_website_answer: true,
    event: {
      uri: 'https://api.calendly.com/scheduled_events/security-002',
      start_time: '2026-10-10T16:00:00Z'
    },
    invitee: {
      uri: 'https://api.calendly.com/scheduled_events/security-002/invitees/security-002',
      name: 'Robin Security', email: 'robin@acme.com',
      questions_and_answers: [
        { question: 'Your personal website', answer: 'https://portfolio.acme.com' }
      ]
    }
  });
  assert.equal(normalized.ok, false);
  assert.ok(normalized.missing.includes('company_website_answer'));
  assert.equal(normalized.booking.domain, null);
});

test('strict website derives registrable company label for subdomains', () => {
  for(const [website,expected] of [
    ['https://docs.supabase.com','Supabase'],
    ['https://app.instructure.com','Instructure'],
    ['https://docs.acme.co.uk','Acme']
  ]) {
    const normalized = normalizeCalendlyBooking({
      consultant_id: consultantId,
      require_company_website_answer: true,
      event: {
        uri: 'https://api.calendly.com/scheduled_events/security-003',
        start_time: '2026-10-10T16:00:00Z'
      },
      invitee: {
        uri: 'https://api.calendly.com/scheduled_events/security-003/invitees/security-003',
        name: 'Robin Security', email: 'robin@gmail.com',
        questions_and_answers: [
          { question: 'Company website', answer: website }
        ]
      }
    });
    assert.equal(normalized.ok, true, website);
    assert.equal(normalized.booking.company, expected, website);
    assert.equal(normalized.provenance.domain, 'QUESTION_DOMAIN');
  }
});
