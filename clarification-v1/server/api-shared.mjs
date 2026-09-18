import { createVercelBlobJsonStorage } from '../../calibration-v3/server/blob-storage.mjs';
import { createClarificationRepository } from './repository.mjs';
import { createClarificationService } from './service.mjs';

let cached;

export function clarificationServerContext() {
  if (cached) return cached;
  const storage = createVercelBlobJsonStorage();
  const repository = createClarificationRepository(storage);
  const sessionSecret = process.env.CLARIS_SESSION_SECRET;
  if (!sessionSecret) throw new Error('CLARIS_SESSION_SECRET_REQUIRED');
  const service = createClarificationService({ repository, sessionSecret });
  cached = { storage, repository, service };
  return cached;
}
