import {
  buildClarificationProposerMessages,
  buildClarificationRepairMessages,
  buildClarificationVerifierMessages
} from './model-prompts.mjs';

function assertJsonObject(value, stage) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`CLARIFICATION_${stage}_OUTPUT_INVALID`);
  }
  return value;
}

export function createClarificationModelAgents({ generateJson }) {
  if (typeof generateJson !== 'function') throw new Error('CLARIFICATION_GENERATE_JSON_REQUIRED');

  async function call(stage, messages) {
    const result = await generateJson({
      task: `clarification_${stage.toLowerCase()}`,
      temperature: 0,
      response_format: 'json_object',
      messages
    });
    return assertJsonObject(result, stage);
  }

  return {
    proposer: async (request) => call('PROPOSER', buildClarificationProposerMessages(request)),
    verifier: async (request) => call('VERIFIER', buildClarificationVerifierMessages(request)),
    repairer: async (request) => call('REPAIR', buildClarificationRepairMessages(request))
  };
}
