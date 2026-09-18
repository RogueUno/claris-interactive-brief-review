import { bootstrapProductionSession, renderProductionBlock, startProductionPersistence } from './production-session.mjs?v=3.7';

const status = await bootstrapProductionSession();
window.__CLARIS_PRODUCTION_SESSION__ = status;

if (status.mode === 'invite-error' || status.mode === 'seed-required' || status.mode === 'server-error') {
  renderProductionBlock(status);
} else {
  await import('./app.js?v=3.7');
  await import('./chapter-bridges-v2.7.js?v=3.6');
  await import('./lifecycle/browser-lifecycle.mjs');
  startProductionPersistence(status);
}
