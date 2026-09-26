import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeliveryGateway } from '../../../api/delivery/package.mjs';
import { createBriefRepository } from '../repository.mjs';
import { createBriefService } from '../service.mjs';

function memoryStorage() {
  const data = new Map();
  return {
    data,
    async getJson(path) {
      const value = data.get(path);
      return value == null ? null : JSON.parse(JSON.stringify(value));
    },
    async putJson(path, value) {
      data.set(path, JSON.parse(JSON.stringify(value)));
      return { etag: 'test' };
    }
  };
}

const payload = {
  prepare: {
    schema_version: 'CLARIS_PREMIUM_PREPARE_V3_6',
    open_dimensions: [{ dimension_id: 'D1', max_questions: 1 }]
  },
  discovery: {
    schema_version: 'CLARIS_DISCOVERY_INTELLIGENCE_V1_2',
    authorized_dimensions: [{ dimension_id: 'D1', authority: 'PREPARE', policy_key: null }],
    commercial_target: [],
    primary_questions: [{
      question_id: 'Q1',
      dimension_id: 'D1',
      ask: 'Which API surface is in scope?',
      linked_service_paths: [{ service_id: 'SVC_ADVISORY', condition: 'Guidance requested.' }],
      conditional_probes: []
    }],
    end_of_call_decision: {
      ready_for_next_step_if: ['Scope and outcome are clear.'],
      remain_in_discovery_if: ['D1 remains unresolved.'],
      disqualify_or_deprioritize_if: ['Requirement is outside all available services.']
    }
  }
};

const validationContext = {
  services: [{ service_id: 'SVC_ADVISORY', name: 'Advisory vCISO' }],
  commercial_rules: { budget_required_before_first_call: false }
};

function setup() {
  const storage = memoryStorage();
  const service = createBriefService({
    repository: createBriefRepository(storage),
    sessionSecret: 's'.repeat(64)
  });
  const gateway = createDeliveryGateway({
    briefServiceProvider: () => service,
    acceptedKeysProvider: () => ['make-test-key', 'admin-test-key'],
    briefBaseUrlProvider: () => 'https://preview.example/brief-v1/'
  });
  return { storage, service, gateway };
}

function request(operation, body = {}, { auth = false, cookie = null, header = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (header && operation) headers['X-Claris-Delivery'] = operation;
  if (auth) headers.Authorization = 'Bearer make-test-key';
  if (cookie) headers.Cookie = cookie;
  const value = header ? body : { operation, ...body };
  return new Request('https://preview.example/api/delivery/package', {
    method: 'POST',
    headers,
    body: JSON.stringify(value)
  });
}

async function body(response) {
  return response.json();
}

test('legacy delivery remains authenticated and functional', async () => {
  const { gateway } = setup();

  const denied = await gateway.fetch(request('CONSULTANT_FINAL', {
    consultant_delivery_email: 'consultant@example.com',
    company: 'Acme',
    final_brief_markdown: '# Brief\nUseful prep'
  }, { header: false }));
  assert.equal(denied.status, 401);

  const ok = await gateway.fetch(request('CONSULTANT_FINAL', {
    consultant_delivery_email: 'consultant@example.com',
    company: 'Acme',
    final_brief_markdown: '# Brief\nUseful prep'
  }, { auth: true, header: false }));
  assert.equal(ok.status, 200);
  const json = await body(ok);
  assert.equal(json.ok, true);
  assert.equal(json.delivery.kind, 'CONSULTANT_FINAL');
  assert.equal(json.delivery.to, 'consultant@example.com');
});

test('private brief flow creates, resolves, resumes, and revokes through one gateway', async () => {
  const { gateway } = setup();

  const create = await gateway.fetch(request('brief_create', {
    consultant_id: 'consultant_test_1',
    company: 'Acme',
    brief_payload: payload,
    validation_context: validationContext,
    ttl_days: 7
  }, { auth: true }));
  assert.equal(create.status, 201);
  const created = await body(create);
  assert.equal(created.ok, true);
  assert.ok(created.brief_token.length > 30);
  assert.match(created.brief_url, /^https:\/\/preview\.example\/brief-v1\/#brief=/);

  const noSession = await gateway.fetch(request('brief_data', {}));
  assert.equal(noSession.status, 401);

  const resolve = await gateway.fetch(request('brief_resolve', { brief_token: created.brief_token }));
  assert.equal(resolve.status, 200);
  const resolved = await body(resolve);
  assert.equal(resolved.ok, true);
  assert.equal('payload' in resolved.brief, false);
  const setCookie = resolve.headers.get('set-cookie');
  assert.match(setCookie, /claris_brief_session=/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /SameSite=Strict/);
  const cookie = setCookie.split(';')[0];

  const data = await gateway.fetch(request('brief_data', {}, { cookie }));
  assert.equal(data.status, 200);
  const loaded = await body(data);
  assert.deepEqual(loaded.brief.payload, payload);

  const revoke = await gateway.fetch(request('brief_revoke', { brief_id: created.brief_id }, { auth: true }));
  assert.equal(revoke.status, 200);
  assert.equal((await body(revoke)).ok, true);

  const after = await gateway.fetch(request('brief_data', {}, { cookie }));
  assert.equal(after.status, 410);
  assert.equal((await body(after)).error, 'BRIEF_REVOKED');
});

test('private create is authenticated and deterministic validation fails closed', async () => {
  const { gateway, storage } = setup();

  const unauthorized = await gateway.fetch(request('brief_create', {
    consultant_id: 'consultant_test_1',
    company: 'Acme',
    brief_payload: payload,
    validation_context: validationContext
  }));
  assert.equal(unauthorized.status, 401);

  const bad = structuredClone(payload);
  bad.discovery.commercial_target = ['Collect budget if raised.'];
  const rejected = await gateway.fetch(request('brief_create', {
    consultant_id: 'consultant_test_1',
    company: 'Acme',
    brief_payload: bad,
    validation_context: validationContext
  }, { auth: true }));
  assert.equal(rejected.status, 422);
  const rejectedBody = await body(rejected);
  assert.equal(rejectedBody.ok, false);
  assert.equal(rejectedBody.errors.some((item) => item.code === 'ECON_TARGET_NONEMPTY'), true);
  assert.equal(storage.data.size, 0);
});
