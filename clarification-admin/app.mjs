const form = document.getElementById('package-form');
const adminKey = document.getElementById('admin-key');
const opportunityId = document.getElementById('opportunity-id');
const ttl = document.getElementById('ttl');
const consultantId = document.getElementById('consultant-id');
const consultantFirst = document.getElementById('consultant-first');
const consultantFirm = document.getElementById('consultant-firm');
const prospectFirst = document.getElementById('prospect-first');
const prospectRole = document.getElementById('prospect-role');
const prospectCompany = document.getElementById('prospect-company');
const fixtureMode = document.getElementById('fixture-mode');
const create = document.getElementById('create');
const status = document.getElementById('status');
const result = document.getElementById('result');
const inviteLabel = document.getElementById('invite-label');
const inviteUrl = document.getElementById('invite-url');
const copy = document.getElementById('copy');
const open = document.getElementById('open');
const reissue = document.getElementById('reissue');

function resetFixtureIdentity() {
  const stamp = Date.now();
  opportunityId.value = `opp_demo_${stamp}`;
  consultantId.value = 'consultant_demo';
  consultantFirst.value = 'Sarah';
  consultantFirm.value = 'Northstar Security';
  prospectFirst.value = 'Alex';
  prospectRole.value = 'VP Engineering';
  prospectCompany.value = 'Acme';
}
resetFixtureIdentity();

function setStatus(message, kind = '') {
  status.textContent = message;
  status.dataset.kind = kind;
}

function dynamicQuestions() {
  const company = prospectCompany.value.trim();
  const prospect = prospectFirst.value.trim();

  return [
    {
      question_id: 'q_priority',
      mode: 'CONFIRM',
      prompt: 'Is SOC 2 still the immediate priority?',
      display_context: `We can see SOC 2 is part of ${company}’s current security story. A quick check helps us avoid assuming it is still the main priority.`,
      response_type: 'SINGLE_CHOICE',
      allow_other: true,
      allow_unsure: true,
      options: [
        {
          option_id: 'priority_soc2',
          label: 'Yes — SOC 2 is the priority',
          posture: 'EVIDENCE_DERIVED',
          basis_ids: ['ev_company_soc2']
        },
        {
          option_id: 'priority_other_framework',
          label: 'Another framework or requirement is more urgent',
          posture: 'GENERIC_SAFE',
          basis_ids: []
        },
        {
          option_id: 'priority_deciding',
          label: 'We’re still deciding what comes first',
          posture: 'GENERIC_SAFE',
          basis_ids: []
        }
      ],
      required: true,
      evidence_refs: [
        {
          evidence_id: 'ev_company_soc2',
          source_type: 'PUBLIC_WEB',
          subject: 'COMPANY',
          ref: 'fixture://company/trust-center'
        }
      ]
    },
    {
      question_id: 'q_owner',
      mode: 'CONTRAST',
      prompt: 'Who is most likely to own this internally?',
      display_context: `We have signals pointing to both ${prospect}’s engineering role and a broader compliance initiative, so we’d rather confirm the owner than guess.`,
      response_type: 'SINGLE_CHOICE',
      allow_other: true,
      allow_unsure: true,
      options: [
        {
          option_id: 'owner_engineering',
          label: 'Engineering / IT',
          posture: 'INFERENCE',
          basis_ids: ['ev_prospect_role']
        },
        {
          option_id: 'owner_security',
          label: 'Security / GRC',
          posture: 'INFERENCE',
          basis_ids: ['ev_booking_compliance']
        },
        {
          option_id: 'owner_shared',
          label: 'Shared ownership across teams',
          posture: 'GENERIC_SAFE',
          basis_ids: []
        }
      ],
      required: true,
      evidence_refs: [
        {
          evidence_id: 'ev_prospect_role',
          source_type: 'PUBLIC_WEB',
          subject: 'PROSPECT',
          ref: 'fixture://prospect/public-role'
        },
        {
          evidence_id: 'ev_booking_compliance',
          source_type: 'BOOKING',
          subject: 'OPPORTUNITY',
          ref: 'fixture://booking/context'
        }
      ]
    },
    {
      question_id: 'q_trigger',
      mode: 'DISCOVER',
      prompt: 'What best describes why this became a priority now?',
      display_context: 'We already have most of the background. This just helps us understand what changed recently.',
      response_type: 'SINGLE_CHOICE',
      allow_other: true,
      allow_unsure: true,
      options: [
        {
          option_id: 'trigger_customer',
          label: 'A customer or prospect is asking for security or compliance evidence',
          posture: 'INFERENCE',
          basis_ids: ['ev_booking_customer']
        },
        {
          option_id: 'trigger_upmarket',
          label: 'Larger customers are raising the security bar',
          posture: 'INFERENCE',
          basis_ids: ['ev_company_enterprise']
        },
        {
          option_id: 'trigger_deadline',
          label: 'A compliance milestone or deadline is approaching',
          posture: 'GENERIC_SAFE',
          basis_ids: []
        },
        {
          option_id: 'trigger_maturing',
          label: 'We’re formalizing security as the company grows',
          posture: 'GENERIC_SAFE',
          basis_ids: []
        }
      ],
      required: true,
      evidence_refs: [
        {
          evidence_id: 'ev_booking_customer',
          source_type: 'BOOKING',
          subject: 'OPPORTUNITY',
          ref: 'fixture://booking/customer-security-requirements'
        },
        {
          evidence_id: 'ev_company_enterprise',
          source_type: 'PUBLIC_WEB',
          subject: 'COMPANY',
          ref: 'fixture://company/enterprise-offer'
        }
      ]
    }
  ];
}

function buildPackage() {
  return {
    opportunity_id: opportunityId.value.trim(),
    consultant: {
      consultant_id: consultantId.value.trim(),
      first_name: consultantFirst.value.trim(),
      firm: consultantFirm.value.trim()
    },
    prospect: {
      first_name: prospectFirst.value.trim(),
      role: prospectRole.value.trim() || null,
      company: prospectCompany.value.trim()
    },
    intro_context: fixtureMode.value === 'zero'
      ? null
      : `We already have most of the context on ${prospectCompany.value.trim()} and ${prospectFirst.value.trim()}’s role. These quick checks only resolve what the available signals cannot settle reliably.`,
    questions: fixtureMode.value === 'zero' ? [] : dynamicQuestions()
  };
}

function renderPackageResult(payload) {
  result.hidden = false;
  if (payload.invite_url) {
    inviteLabel.hidden = false;
    inviteUrl.value = payload.invite_url;
    open.hidden = false;
    open.href = payload.invite_url;
    reissue.hidden = false;
    setStatus(`Clarification invite created · ${payload.question_count} questions · expires ${new Date(payload.expires_at).toLocaleString()}`, 'success');
  } else {
    inviteLabel.hidden = true;
    open.hidden = true;
    reissue.hidden = true;
    inviteUrl.value = '';
    setStatus('Zero-question path confirmed · no prospect link was created.', 'success');
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  result.hidden = true;
  setStatus('Creating clarification package…');
  create.disabled = true;

  const key = adminKey.value.trim();
  try {
    const response = await fetch('/api/clarification/admin/package', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify({
        ttl_days: Number(ttl.value),
        package: buildPackage()
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.ok) throw new Error(payload?.error || `HTTP_${response.status}`);
    renderPackageResult(payload);
    adminKey.value = '';
  } catch (error) {
    setStatus(`Could not create clarification package: ${error?.message || 'Unknown error'}`, 'error');
  } finally {
    create.disabled = false;
  }
});

reissue.addEventListener('click', async () => {
  const key = adminKey.value.trim();
  if (!key) {
    setStatus('Enter the admin key again to reissue this invite.', 'error');
    adminKey.focus();
    return;
  }

  reissue.disabled = true;
  setStatus('Reissuing invite…');
  try {
    const response = await fetch('/api/clarification/admin/reissue', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify({
        opportunity_id: opportunityId.value.trim(),
        ttl_days: Number(ttl.value)
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.ok || !payload?.invite_url) {
      throw new Error(payload?.error || `HTTP_${response.status}`);
    }
    inviteUrl.value = payload.invite_url;
    open.href = payload.invite_url;
    adminKey.value = '';
    setStatus(`Invite reissued · expires ${new Date(payload.expires_at).toLocaleString()}`, 'success');
  } catch (error) {
    setStatus(`Could not reissue invite: ${error?.message || 'Unknown error'}`, 'error');
  } finally {
    reissue.disabled = false;
  }
});

copy.addEventListener('click', async () => {
  if (!inviteUrl.value) return;
  await navigator.clipboard.writeText(inviteUrl.value);
  const original = copy.textContent;
  copy.textContent = 'Copied';
  window.setTimeout(() => { copy.textContent = original; }, 1200);
});
