export const goldenOpportunities = Object.freeze({
  soc2_customer_trigger: {
    expected: { decision: 'ASK', max_questions: 2 },
    bundle: {
      opportunity_id: 'opp_golden_soc2_customer',
      consultant: {
        consultant_id: 'consultant_sarah',
        first_name: 'Sarah',
        firm: 'Northstar Security'
      },
      prospect: {
        first_name: 'Alex',
        role: 'VP Engineering',
        company: 'Acme Cloud'
      },
      evidence: [
        {
          evidence_id: 'ev_company_soc2',
          source_type: 'PUBLIC_WEB',
          subject: 'COMPANY',
          visibility: 'PROSPECT_SAFE',
          statement: 'Acme Cloud publicly lists SOC 2 readiness in its trust material.',
          ref: 'fixture://acme/trust/soc2'
        },
        {
          evidence_id: 'ev_booking_customer',
          source_type: 'BOOKING',
          subject: 'OPPORTUNITY',
          visibility: 'PROSPECT_SAFE',
          statement: 'The booking note says a customer is asking for security documentation.',
          ref: 'fixture://booking/customer-request'
        },
        {
          evidence_id: 'ev_prospect_role',
          source_type: 'PUBLIC_WEB',
          subject: 'PROSPECT',
          visibility: 'PROSPECT_SAFE',
          statement: 'Alex is publicly listed as VP Engineering.',
          ref: 'fixture://prospect/alex-role'
        }
      ]
    }
  },

  framework_conflict: {
    expected: { decision: 'ASK', max_questions: 1 },
    bundle: {
      opportunity_id: 'opp_golden_framework_conflict',
      consultant: {
        consultant_id: 'consultant_sarah',
        first_name: 'Sarah',
        firm: 'Northstar Security'
      },
      prospect: {
        first_name: 'Maya',
        role: 'COO',
        company: 'Ledger Works'
      },
      evidence: [
        {
          evidence_id: 'ev_company_soc2',
          source_type: 'PUBLIC_WEB',
          subject: 'COMPANY',
          visibility: 'PROSPECT_SAFE',
          statement: 'Ledger Works prominently references SOC 2 on its security page.',
          ref: 'fixture://ledger/security'
        },
        {
          evidence_id: 'ev_booking_iso',
          source_type: 'BOOKING',
          subject: 'OPPORTUNITY',
          visibility: 'PROSPECT_SAFE',
          statement: 'The booking note asks about ISO 27001 readiness for an upcoming customer requirement.',
          ref: 'fixture://booking/iso27001'
        }
      ]
    }
  },

  already_sufficient: {
    expected: { decision: 'SKIP', max_questions: 0 },
    bundle: {
      opportunity_id: 'opp_golden_sufficient',
      consultant: {
        consultant_id: 'consultant_sarah',
        first_name: 'Sarah',
        firm: 'Northstar Security'
      },
      prospect: {
        first_name: 'Jordan',
        role: 'Head of Security',
        company: 'Parcel Labs'
      },
      evidence: [
        {
          evidence_id: 'ev_booking_priority',
          source_type: 'BOOKING',
          subject: 'OPPORTUNITY',
          visibility: 'PROSPECT_SAFE',
          statement: 'The prospect states SOC 2 Type II is the immediate priority.',
          ref: 'fixture://booking/priority'
        },
        {
          evidence_id: 'ev_booking_trigger',
          source_type: 'BOOKING',
          subject: 'OPPORTUNITY',
          visibility: 'PROSPECT_SAFE',
          statement: 'The prospect states an enterprise customer review is the trigger.',
          ref: 'fixture://booking/trigger'
        },
        {
          evidence_id: 'ev_booking_owner',
          source_type: 'BOOKING',
          subject: 'OPPORTUNITY',
          visibility: 'PROSPECT_SAFE',
          statement: 'The prospect states the Head of Security owns the initiative.',
          ref: 'fixture://booking/owner'
        },
        {
          evidence_id: 'ev_booking_timeline',
          source_type: 'BOOKING',
          subject: 'OPPORTUNITY',
          visibility: 'PROSPECT_SAFE',
          statement: 'The prospect states the target is this quarter.',
          ref: 'fixture://booking/timeline'
        }
      ]
    }
  },

  sparse_context: {
    expected: { decision: 'ASK', max_questions: 2 },
    bundle: {
      opportunity_id: 'opp_golden_sparse',
      consultant: {
        consultant_id: 'consultant_sarah',
        first_name: 'Sarah',
        firm: 'Northstar Security'
      },
      prospect: {
        first_name: 'Nina',
        role: 'Founder',
        company: 'Vector Stack'
      },
      evidence: [
        {
          evidence_id: 'ev_booking_general',
          source_type: 'BOOKING',
          subject: 'OPPORTUNITY',
          visibility: 'PROSPECT_SAFE',
          statement: 'The booking note says only: need help improving our security and compliance posture.',
          ref: 'fixture://booking/general-security'
        },
        {
          evidence_id: 'ev_prospect_founder',
          source_type: 'PUBLIC_WEB',
          subject: 'PROSPECT',
          visibility: 'PROSPECT_SAFE',
          statement: 'Nina is publicly listed as founder.',
          ref: 'fixture://prospect/nina-founder'
        }
      ]
    }
  },

  sensitive_internal_signal: {
    expected: { decision: 'ASK_NEUTRAL', max_questions: 1 },
    bundle: {
      opportunity_id: 'opp_golden_sensitive',
      consultant: {
        consultant_id: 'consultant_sarah',
        first_name: 'Sarah',
        firm: 'Northstar Security'
      },
      prospect: {
        first_name: 'Omar',
        role: 'CTO',
        company: 'Signal Forge'
      },
      evidence: [
        {
          evidence_id: 'ev_internal_incident',
          source_type: 'PUBLIC_WEB',
          subject: 'COMPANY',
          visibility: 'INTERNAL_ONLY',
          statement: 'A public incident report indicates Signal Forge experienced a security event.',
          ref: 'fixture://internal/incident-report'
        },
        {
          evidence_id: 'ev_booking_review',
          source_type: 'BOOKING',
          subject: 'OPPORTUNITY',
          visibility: 'PROSPECT_SAFE',
          statement: 'The booking note says they want to review current security priorities.',
          ref: 'fixture://booking/security-review'
        }
      ]
    }
  }
});
