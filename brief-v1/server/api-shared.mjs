import { createVercelBlobJsonStorage } from '../../calibration-v3/server/blob-storage.mjs';
import { createBriefRepository } from './repository.mjs';
import { createBriefService } from './service.mjs';

let cached;
export function briefServerContext() {
  if (cached) return cached;
  const storage = createVercelBlobJsonStorage();
  const repository = createBriefRepository(storage);
  const sessionSecret = process.env.CLARIS_SESSION_SECRET;
  if (!sessionSecret) throw new Error('CLARIS_SESSION_SECRET_REQUIRED');
  const service = createBriefService({ repository, sessionSecret });
  cached = { storage, repository, service };
  return cached;
}
