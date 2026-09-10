(() => {
  const currentCase = 'real_planoly_current';
  if (new URLSearchParams(window.location.search).get('case') !== currentCase) return;

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const safeUrl = (value) => {
    try {
      const url = new URL(value, window.location.origin);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch { return null; }
  };
  const readArtifact = () => {
    const request = new XMLHttpRequest();
    request.open('GET', './data/real_planoly_current.json', false);
    request.send(null);
    if (request.status < 200 || request.status >= 300) throw new Error(`Unable to load ${currentCase}: ${request.status}`);
    const payload = JSON.parse(request.responseText);
    return payload.result || payload;
  };

  const buildCase = (result) => {
    const brief = result.briefJson;
    const intelligence = brief.consultant_intelligence || {};
    const diagnostics = brief.grounded_display_diagnostics || {};
    const rankedSources = diagnostics.ranked_sources || [];
    const consultant = brief.consultant_context || {};
    const service = brief.service_fit_posture || {};
    const meeting = brief.meeting_context || {};
    const booking = brief.subject?.booking_context || {};
    const meetingDate = booking.meeting_time ? new Date(booking.meeting_time) : null;
    const displayDate = meetingDate && !Number.isNaN(meetingDate.getTime())
      ? new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(meetingDate)
      : 'Not provided';
    const displayTime = meetingDate && !Number.isNaN(meetingDate.getTime())
      ? new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(meetingDate)
      : 'Not provided';
    const companyContext = intelligence.company_context?.[0]?.text || 'Company context was not generated in the current live artifact.';
    const seenSources = new Set();
    const sources = rankedSources.filter((source) => {
      const key = `${String(source.source_url || '').toLowerCase().replace(/\/$/, '')}|${String(source.source_title || '').toLowerCase().replace(/\s+/g, ' ').trim()}`;
      if (seenSources.has(key)) return false;
      seenSources.add(key);
      return true;
    }).map((source) => ({
      id: source.evidence_id,
      title: source.source_title,
      url: source.source_url,
      source_type: String(source.source_type || '').toLowerCase(),
      classification: source.source_type === 'FIRST_PARTY_PUBLIC' ? 'FIRST-PARTY' : 'THIRD-PARTY',
      presentation_label: source.source_type === 'FIRST_PARTY_PUBLIC' ? 'Public first-party' : 'Public third-party'
    }));
    const sourceIds = new Set(rankedSources.map((source) => source.evidence_id));
    const claims = (intelligence.basis || []).filter((item) => item?.text).map((item, index) => {
      const ref = (item.source_refs || []).find((candidate) => sourceIds.has(candidate));
      const source = rankedSources.find((candidate) => candidate.evidence_id === ref);
      const origin = item.source_refs?.some((candidate) => /^(meeting_context|prospect_answer):/i.test(candidate))
        ? 'Prospect provided'
        : item.posture === 'HYPOTHESIS' ? 'Hypothesis'
          : item.posture === 'UNKNOWN' ? 'Unknown'
            : item.posture === 'ACTION' ? 'Action'
              : item.posture === 'INTERPRETATION' ? 'CLARIS interpretation'
                : source?.source_type === 'FIRST_PARTY_PUBLIC' ? 'Public first-party' : 'Public third-party';
      return {
        evidence_id: `current_planoly_basis_${index + 1}`,
        claim: item.text,
        epistemic_status: item.posture || 'UNKNOWN',
        origin,
        source_title: source?.source_title || 'Current CLARIS display synthesis',
        source_url: source?.source_url || null,
        source_class: source?.source_type || 'DISPLAY_ONLY',
        why_it_matters: item.consultant_relevance || 'Display-only consultant preparation context.',
        what_to_verify: item.verification_path || 'Verify during the discovery conversation.',
        supporting_sentence: source?.snippet || null
      };
    });
    const questions = (brief.consultant_live_discovery_questions || []).map((item, index) => ({
      question_number: index + 1,
      question_text: item.question,
      rationale: item.rationale,
      listen_for: item.listen_for,
      verify_avoid_assuming: item.avoid_assuming,
      tested_hypothesis_or_gap: item.tested_hypothesis_or_gap
    }));
    const name = brief.subject?.person_name || 'Prospect';
    const email = brief.subject?.person_email || '';
    return {
      brief_id: currentCase,
      generated_at: brief.generated_at || result.executed_at,
      metadata: { benchmark_label: 'CURRENT CLARIS · LIVE ADAPTIVE-LIGHT BENCHMARK' },
      consultant: {
        id: result.consultant_id,
        name: consultant.consultant_name || 'Consultant',
        first_name: (consultant.consultant_name || 'Consultant').split(' ')[0],
        firm_name: consultant.firm_name || 'Consultant',
        display_timezone: consultant.display_timezone || 'UTC',
        provenance: 'CURRENT_CLARIS_LIVE_ADAPTIVE_LIGHT'
      },
      prospect: {
        name, first_name: name.split(' ')[0], email, role: null, role_display: null,
        has_verified_role: false, role_status: 'UNKNOWN',
        company_name: brief.subject?.company_name || brief.company_context?.name || 'Prospect',
        domain: brief.subject?.domain || '', company_domain: brief.subject?.domain || '',
        company_scale: brief.company_context?.scale || null,
        company_description: companyContext,
        verified_website_url: brief.subject?.domain || null
      },
      booking_context_text: meeting.source_text || '',
      meeting: {
        raw_iso_time: booking.meeting_time || 'Not provided', scheduled_time_utc: booking.meeting_time || 'Not provided',
        display_date: displayDate, derived_weekday: meetingDate ? displayDate.split(',')[0] : 'Not provided', display_time: displayTime,
        time_relative: 'historical live benchmark', display_timezone: consultant.display_timezone || 'UTC',
        timezone_abbr: consultant.display_timezone || 'UTC', meeting_url: booking.meeting_url || null,
        relation_sentence: `Discovery call with ${name} of ${brief.subject?.company_name || 'the prospect'}.`,
        intake_mode: 'adaptive_light', attendees: [{ name, email, role: 'Prospect Contact' }]
      },
      opportunity: {
        decision: brief.decision || result.decision || 'QUALIFY',
        decision_badge: `${brief.decision || result.decision || 'QUALIFY'} (PROVISIONAL)`,
        assessment_status: brief.assessment_status || result.assessment_status || 'PROVISIONAL',
        icp_fit_tier: brief.fit_tier || null, opportunity_score: brief.opportunity_score ?? null,
        score_display_mode: 'INSUFFICIENT_EVIDENCE_POSTURE', confidence_level: brief.confidence_level || 'Still being established',
        decision_dimension_coverage_pct: null, decision_readiness_summary: 'Current live artifact remains provisional.', is_provisional: true,
        strategic_take: intelligence.interpretation || intelligence.what_matters_items?.map((item) => item.text).join(' ') || '',
        consultant_relevance: consultant.firm_name || 'Current CLARIS live benchmark.'
      },
      engagement_fit: {
        potential_service_fit: brief.potential_service_fit_display || 'Service direction not established yet',
        potential_service_fit_code: 'NO_CONFIDENT_SERVICE_FIT_YET', potential_service_fit_display: brief.potential_service_fit_display || 'Service direction not established yet',
        is_established: Boolean(service.is_service_recommended), secondary_service_fit: null,
        need_status: brief.need_status || service.need_status || 'UNKNOWN', need_status_display: 'Not established',
        discovery_guidance: intelligence.call_direction || 'Use discovery to verify unresolved context.',
        need_summary_text: 'Current live artifact does not establish service direction.',
        service_fit_hypothesis: intelligence.consultant_relevance || 'Display-only current live intelligence.'
      },
      posture: {
        cloud_provider: brief.company_context?.cloud_provider || 'UNKNOWN', security_tooling: brief.company_context?.security_tooling || [],
        external_security_signals: brief.company_context?.external_security_signals || [], compliance_disclosures: brief.company_context?.compliance_disclosures || [],
        material_conflicts: [], has_conflicts: false
      },
      copilot: {
        questions,
        verification_checklist: (intelligence.uncertainty || []).map((item, index) => ({ id: `current_gap_${index + 1}`, label: item, completed: false })),
        call_strategy: { direction: intelligence.call_direction || '', suggested_next_step: intelligence.suggested_next_step || 'No next step was generated.' },
        follow_up: { follow_up_status: 'CONDITIONAL', recommended_action: intelligence.suggested_next_step || '', condition_to_trigger: intelligence.suggested_next_step_detail?.condition_to_trigger || 'Confirm remaining discovery context.' }
      },
      evidence: {
        overall_research_coverage_pct: null,
        sources, curated_claims: claims, traceability_map: {},
        provenance_summary: `Current generic engine · live research snapshot · ${diagnostics.status || 'display synthesis'} · ${brief.assessment_status || 'provisional'}`
      }
    };
  };

  let currentData;
  try { currentData = buildCase(readArtifact()); } catch (error) {
    window.addEventListener('DOMContentLoaded', () => { document.body.dataset.planolyAdapterError = error.message; });
    return;
  }

  window.addEventListener('DOMContentLoaded', () => window.setTimeout(() => {
    const data = currentData;
    const setText = (id, value) => { const node = document.getElementById(id); if (node) node.textContent = value || '—'; };
    const pill = document.querySelector('.review-mode-indicator-pill'); if (pill) pill.textContent = 'Current generic engine · live research snapshot · acceptance not qualified';
    const select = document.getElementById('caseSelect'); if (select) select.value = currentCase;
    setText('entryLine1', data.consultant.first_name ? `Hello, ${data.consultant.first_name}.` : 'Hello.');
    setText('entryLine2', data.prospect.name ? `I have prepared your meeting with ${data.prospect.name}.` : 'I have prepared the current live brief.');
    setText('personName', data.prospect.name); setText('contactEmailText', data.prospect.email); setText('companyNarrativeText', data.prospect.company_description); setText('bookingContextText', data.booking_context_text);
    setText('meetingDateMicro', data.meeting.display_date); setText('meetingTimeFigure', data.meeting.display_time); setText('meetingMetaText', `${data.meeting.timezone_abbr} · ${data.meeting.time_relative}`);
    setText('leadFitValueDisplay', 'Insufficient Evidence Posture'); setText('workflowBadgeText', data.opportunity.decision); setText('workflowStatusText', data.opportunity.assessment_status);
    setText('decisionReadinessSub', `Preparation: ${brief.preparation_status === 'PREP_READY' ? 'READY' : brief.preparation_status === 'PREP_LIMITED' ? 'LIMITED' : 'READY WITH OPEN ITEMS'} · Current generic engine`); setText('serviceFitTitle', data.engagement_fit.potential_service_fit); setText('serviceFitSubtext', data.engagement_fit.need_summary_text); setText('whatMattersEditorial', data.opportunity.strategic_take);
    setText('contextFitTitle', data.engagement_fit.potential_service_fit); setText('contextWhyFitText', data.engagement_fit.service_fit_hypothesis); setText('contextNeedStatusText', data.engagement_fit.need_status_display);
    setText('postureCloudSecurityText', 'Primary cloud hosting provider not confirmed in reviewed evidence'); setText('postureComplianceText', 'No public badges advertised (Absence != gap)'); setText('postureExternalAssuranceText', 'Not established from reviewed public evidence');
    setText('callDirectionText', data.copilot.call_strategy.direction); setText('strategyNextStepText', data.copilot.call_strategy.suggested_next_step);

    const emailLink = document.getElementById('contactEmailLink');
    const mailButton = document.getElementById('contactMailBtn');
    [emailLink, mailButton].forEach((node) => {
      if (!node) return;
      if (data.prospect.email) { node.href = `mailto:${encodeURIComponent(data.prospect.email)}`; node.style.display = ''; }
      else { node.removeAttribute('href'); node.style.display = 'none'; }
    });
    const websiteButton = document.getElementById('contactWebsiteBtn');
    if (websiteButton) {
      const website = safeUrl(data.prospect.verified_website_url);
      if (website) { websiteButton.href = website; websiteButton.style.display = 'inline-flex'; }
      else { websiteButton.removeAttribute('href'); websiteButton.style.display = 'none'; }
    }
    const joinButton = document.getElementById('joinMeetingBtn');
    if (joinButton) {
      const joinUrl = safeUrl(data.meeting.meeting_url);
      if (joinUrl) { joinButton.href = joinUrl; joinButton.style.display = 'inline-flex'; }
      else { joinButton.removeAttribute('href'); joinButton.style.display = 'none'; }
    }
    ['evidenceCoverageNum', 'evidenceReadinessNum', 'evidenceConfidenceNum'].forEach((id) => {
      const node = document.getElementById(id);
      const metric = node?.closest('.evidence-metric-pill');
      if (metric) metric.style.display = 'none';
    });
    const metrics = document.querySelector('.evidence-metrics-summary-row');
    if (metrics) metrics.style.display = 'none';
    setText('provenanceRunId', result.identity?.opportunity_id || result.prospect_id || currentCase);
    setText('provenanceSummaryText', data.evidence.provenance_summary);
    setText('provenanceConsultantFirm', data.consultant.firm_name);

    const questions = document.getElementById('discoveryQuestionsList');
    if (questions) {
      questions.innerHTML = data.copilot.questions.map((item) => `<div class="discovery-question-card"><div class="question-header-row"><span class="question-num-tag">${String(item.question_number).padStart(2, '0')}</span></div><p class="question-text-quote">"${escapeHtml(item.question_text)}"</p><button class="question-expand-trigger" aria-expanded="false"><span>Why CLARIS is asking this</span><span aria-hidden="true">⌄</span></button><div class="question-drawer-content"><div class="question-drawer-field"><span class="question-drawer-label">Rationale</span><p class="question-drawer-text">${escapeHtml(item.rationale)}</p></div><div class="question-drawer-field"><span class="question-drawer-label">Listen For</span><p class="question-drawer-text">${escapeHtml(item.listen_for)}</p></div><div class="question-drawer-field"><span class="question-drawer-label">Avoid Assuming</span><p class="question-drawer-text">${escapeHtml(item.verify_avoid_assuming)}</p></div><div class="question-drawer-field"><span class="question-drawer-label">Tests</span><p class="question-drawer-text">${escapeHtml(item.tested_hypothesis_or_gap || '')}</p></div></div></div>`).join('');
      questions.querySelectorAll('.question-expand-trigger').forEach((button) => button.addEventListener('click', () => { const expanded = button.closest('.discovery-question-card').classList.toggle('expanded'); button.setAttribute('aria-expanded', String(expanded)); }));
    }
    const tasks = document.getElementById('verificationTasksList');
    if (tasks) tasks.innerHTML = data.copilot.verification_checklist.map((item) => `<div class="verification-task-item" data-task-id="${escapeHtml(item.id)}" tabindex="0" role="checkbox" aria-checked="false"><div class="task-checkbox-box"><span aria-hidden="true">✓</span></div><span class="task-label-text">${escapeHtml(item.label)}</span></div>`).join('');
    const sourceList = document.getElementById('sourcesListRow');
    if (sourceList) sourceList.innerHTML = data.evidence.sources.map((source) => { const url = safeUrl(source.url); const body = `<span class="source-badge ${source.classification.toLowerCase()}">${escapeHtml(source.presentation_label)}</span><span>${escapeHtml(source.title)}</span>`; return url ? `<a class="source-link-chip" href="${url}" target="_blank" rel="noopener noreferrer">${body}</a>` : `<span class="source-link-chip">${body}</span>`; }).join('');
    const claims = document.getElementById('curatedClaimsList');
    if (claims) {
      claims.innerHTML = data.evidence.curated_claims.map((claim) => { const url = safeUrl(claim.source_url); return `<div class="curated-claim-card"><div class="claim-header-row"><span class="claim-title-text">${escapeHtml(claim.claim)}</span><span class="epistemic-badge">${escapeHtml(claim.epistemic_status)} · ${escapeHtml(claim.origin)}</span></div><button class="claim-expand-trigger" aria-expanded="false"><span>Why does CLARIS think this?</span><span aria-hidden="true">⌄</span></button><div class="claim-drawer-content"><div class="claim-drawer-field"><span class="claim-drawer-label">Commercial Relevance (Why it Matters)</span><p class="claim-drawer-text">${escapeHtml(claim.why_it_matters)}</p></div><div class="claim-drawer-field"><span class="claim-drawer-label">Discovery Verification Angle</span><p class="claim-drawer-text">${escapeHtml(claim.what_to_verify)}</p></div><div class="claim-drawer-field"><span class="claim-drawer-label">Source Citation</span><p class="claim-drawer-text">${url ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${escapeHtml(claim.source_title)}</a>` : escapeHtml(claim.source_title)}</p></div>${claim.supporting_sentence ? `<div class="claim-drawer-field"><span class="claim-drawer-label">Supporting Excerpt</span><p class="claim-drawer-text">"${escapeHtml(claim.supporting_sentence)}"</p></div>` : ''}</div></div>`; }).join('');
      claims.querySelectorAll('.claim-expand-trigger').forEach((button) => button.addEventListener('click', () => { const expanded = button.closest('.curated-claim-card').classList.toggle('expanded'); button.setAttribute('aria-expanded', String(expanded)); }));
    }
  }, 0));
})();
