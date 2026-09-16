export const FIELD_META = {
  services: { chapter: 'Practice', critical: true, owner: 'consultant', research: 'prefill_then_confirm', runtime: 'mapped_v3' },
  serviceStates: { chapter: 'Practice', critical: true, owner: 'consultant', research: 'none', runtime: 'compile_subset_only' },
  leadServiceId: { chapter: 'Practice', critical: false, owner: 'consultant', research: 'none', runtime: 'profile_only' },
  pausedPolicies: { chapter: 'Practice', critical: false, owner: 'consultant', research: 'none', runtime: 'profile_only' },
  companyTypes: { chapter: 'Opportunity', critical: true, owner: 'consultant', research: 'prefill_then_confirm', runtime: 'mapped_v3' },
  buyerRoles: { chapter: 'Opportunity', critical: false, owner: 'consultant', research: 'prefill_then_confirm', runtime: 'profile_only' },
  companyStage: { chapter: 'Opportunity', critical: false, owner: 'consultant', research: 'prefill_then_confirm', runtime: 'profile_only' },
  geographyMatters: { chapter: 'Opportunity', critical: false, owner: 'consultant', research: 'confirm_if_relevant', runtime: 'profile_only' },
  geographies: { chapter: 'Opportunity', critical: false, owner: 'consultant', research: 'prefill_then_confirm', runtime: 'profile_only' },
  minimumEngagement: { chapter: 'Commercial', critical: true, owner: 'consultant', research: 'none', runtime: 'mapped_v3_if_currency_supported' },
  currency: { chapter: 'Commercial', critical: true, owner: 'consultant', research: 'none', runtime: 'conditional' },
  engagementModels: { chapter: 'Commercial', critical: false, owner: 'consultant', research: 'prefill_then_confirm', runtime: 'profile_only' },
  budgetRequired: { chapter: 'Commercial', critical: true, owner: 'consultant', research: 'none', runtime: 'mapped_v3' },
  hardDisqualifiers: { chapter: 'Commercial', critical: true, owner: 'consultant', research: 'none', runtime: 'profile_only' },
  cautionSignals: { chapter: 'Commercial', critical: false, owner: 'consultant', research: 'none', runtime: 'profile_only' },
  firstCallRules: { chapter: 'Judgment', critical: true, owner: 'consultant', research: 'none', runtime: 'mapped_subset_v3' },
  positiveSignals: { chapter: 'Judgment', critical: false, owner: 'consultant', research: 'none', runtime: 'profile_only' },
  vanitySignals: { chapter: 'Judgment', critical: false, owner: 'consultant', research: 'none', runtime: 'profile_only' },
  discoveryStyle: { chapter: 'Strategy', critical: false, owner: 'consultant', research: 'none', runtime: 'profile_only' },
  briefDensity: { chapter: 'Strategy', critical: false, owner: 'consultant', research: 'none', runtime: 'profile_only' },
  preferredNextMove: { chapter: 'Strategy', critical: false, owner: 'consultant', research: 'none', runtime: 'profile_only' },
  proofPoints: { chapter: 'Strategy', critical: false, owner: 'consultant', research: 'none', runtime: 'profile_only' },
  avoidPush: { chapter: 'Strategy', critical: false, owner: 'consultant', research: 'none', runtime: 'profile_only' },
  exceptions: { chapter: 'Exceptions', critical: false, owner: 'consultant', research: 'none', runtime: 'profile_only' }
};

export const OPTIONS = {
  companyTypes: ['B2B SaaS', 'Software', 'FinTech', 'HealthTech', 'AI / Cloud infrastructure'],
  buyerRoles: ['CISO / Security lead', 'CTO / VP Engineering', 'GRC / Compliance lead', 'Founder / CEO', 'Procurement / Legal'],
  companyStage: ['No hard size rule', 'Early-stage with real security pressure', 'Growth / scale-up', 'Mid-market', 'Enterprise'],
  geography: ['North America', 'UK / Ireland', 'EU / EEA', 'Remote — no material constraint'],
  engagementModels: ['Fixed-scope project', 'Retainer / ongoing advisory', 'Fractional leadership', 'Assessment / audit', 'Workshop / advisory sprint'],
  hardDisqualifiers: ['No clear service/problem alignment', 'Pure price-shopping / commodity RFP', 'No plausible stakeholder ownership', 'Timeline incompatible with delivery', 'Outside supported geography'],
  cautionSignals: ['Very early / exploratory only', 'Unclear internal owner', 'Wants deliverables before diagnosis', 'Compliance checkbox with no operational owner', 'Implementation expectations outside scope'],
  firstCallRules: [
    { value: 'documented service/problem alignment', label: 'Documented service/problem alignment' },
    { value: 'not affirmatively disqualified', label: 'Not affirmatively disqualified' },
    { value: 'relevant stakeholder or credible path to one', label: 'Relevant stakeholder — or a credible path to one' },
    { value: 'a real reason to act, not just curiosity', label: 'A real reason to act, not just curiosity' }
  ],
  positiveSignals: ['Security/compliance deadline', 'Enterprise or customer pressure', 'Recent security incident or audit finding', 'Security leadership gap', 'Architecture / product change', 'Active procurement / vendor review'],
  vanitySignals: ['Generic “security is a priority” language', 'Job posts without buying context', 'Tech-stack similarity alone', 'Funding announcement by itself', 'A compliance logo or badge by itself'],
  discoveryStyle: ['Diagnostic first', 'Risk and business impact first', 'Technical depth early', 'Commercial scoping early'],
  briefDensity: ['Concise — only what changes the call', 'Balanced — key evidence + implications', 'Deep — fuller context before the call'],
  preferredNextMove: ['Define the next diagnostic step', 'Scope a paid engagement', 'Bring in a technical stakeholder', 'Send proof / case study', 'No default — decide from the call'],
  proofPoints: ['Relevant case study', 'Comparable engagement outcome', 'Methodology / framework', 'Technical credibility', 'Commercial clarity / scope discipline'],
  avoidPush: ['Pricing too early', 'Retainer too early', 'Specific service before need is clear', 'Compliance framing before business context', 'Technical rabbit holes on call one'],
  exceptions: ['Smaller company with enterprise/customer pressure', 'Outside core industry with a clear service fit', 'Earlier-stage company with urgent compliance deadline', 'Existing client expansion', 'Warm referral with credible need']
};

export const SERVICE_STATE_OPTIONS = [
  { value: 'ACTIVE', label: 'Actively taking this on' },
  { value: 'SELECTIVE', label: 'Selective — only strong-fit cases' },
  { value: 'PAUSED', label: 'Paused for now' },
  { value: 'NO_LONGER', label: 'No longer part of the offer' }
];

export const PAUSED_POLICY_OPTIONS = [
  { value: 'EXPLICIT_ONLY', label: 'Only surface it if the prospect explicitly asks' },
  { value: 'HIDE', label: 'Keep it out of opportunity briefs for now' }
];

export function serviceQuestionCopy(service) {
  const name = service?.name || 'this service';
  const n = name.toLowerCase();
  if (n.includes('soc 2') || n.includes('iso 27001') || n.includes('compliance')) {
    return {
      context: `${name} can be deadline-driven, but not every compliance request is work you actually want.`,
      title: `When ${name} work appears, how intentionally are you taking it on today?`,
      helper: 'This lets me distinguish a real service priority from something the website simply says you can do.'
    };
  }
  if (n.includes('vciso') || n.includes('fractional')) {
    return {
      context: `${name} is usually a longer, trust-heavy relationship rather than a one-off project.`,
      title: `How actively are you looking to take on ${name} relationships right now?`,
      helper: 'I’ll keep that distinction separate from whether a prospect merely looks like a plausible governance fit.'
    };
  }
  if (n.includes('api') || n.includes('audit') || n.includes('penetration') || n.includes('security')) {
    return {
      context: `${name} is typically discrete, technical work with a clearer delivery boundary.`,
      title: `When a ${name} opportunity appears, is it core work you want more of — or something you reserve for unusually strong fits?`,
      helper: 'The answer affects service preference, not the factual evidence standard I use on a prospect.'
    };
  }
  return {
    context: `You’ve kept ${name} in the current service set.`,
    title: `How deliberately should I treat ${name} as work you want more of?`,
    helper: 'I’ll use this as an operating preference, not as permission to manufacture fit.'
  };
}
