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
  return [
    {
      question_id: 'q_priority',
      mode: 'CONFIRM',
      prompt: 'Is SOC 2 still the immediate compliance priority?',
      display_context: `${prospectCompany.value.trim()} currently presents SOC 2 readiness publicly as part of its security work.`,
      response_type: 'SINGLE_CHOICE',
      options: ['Yes — SOC 2 is the priority', 'No — another framework is more urgent', 'It is still being decided'],
      required: true,
      evidence_refs: [
        { source_type: 'PUBLIC_WEB', subject: 'COMPANY', ref: 'fixture://company/trust-center' }
      ]
    },
    {
      question_id: 'q_owner',
      mode: 'CONTRAST',
      prompt: 'Who will own this initiative internally?',
      display_context: `Public role information for ${prospectFirst.value.trim()} suggests engineering ownership, while the booking context points to a broader compliance initiative.`,
      response_type: 'SINGLE_CHOICE',
      options: ['Security / GRC', 'Engineering / IT', 'Executive leadership', 'Shared ownership', 'Not decided yet'],
      required: true,
      evidence_refs: [
        { source_type: 'PUBLIC_WEB', subject: 'PROSPECT', ref: 'fixture://prospect/public-role' },
        { source_type: 'BOOKING', subject: 'OPPORTUNITY', ref: 'fixture://booking/context' }
      ]
    },
    {
      question_id: 'q_trigger',
      mode: 'DISCOVER',
      prompt: 'What made this conversation worth having now?',
      display_context: null,
      response_type: 'LONG_TEXT',
      options: [],
      required: true,
      evidence_refs: []
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
      : `I found a few public signals about ${prospectCompany.value.trim()} and ${prospectFirst.value.trim()}’s role. These questions only clarify what the research still cannot settle reliably.`,
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
