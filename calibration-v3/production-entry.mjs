import { bootstrapProductionSession, renderProductionBlock, startProductionPersistence } from './production-session.mjs';

const status = await bootstrapProductionSession();
window.__CLARIS_PRODUCTION_SESSION__ = status;

if (status.mode === 'invite-error' || status.mode === 'seed-required' || status.mode === 'server-error') {
  renderProductionBlock(status);
} else {
  await import('./app.js');
  await import('./chapter-bridges-v2.7.js');
  await import('./lifecycle/browser-lifecycle.mjs');
  startProductionPersistence(status);
}
