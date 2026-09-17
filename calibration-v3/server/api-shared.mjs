import { createVercelBlobJsonStorage } from './blob-storage.mjs';
import { createProfileRepository } from './repository.mjs';
import { createCalibrationService } from './service.mjs';
import { buildLifecycleRecord } from '../lifecycle/profile-lifecycle.mjs';

let cached;

export function serverContext() {
  if (cached) return cached;
  const storage = createVercelBlobJsonStorage();
  const repository = createProfileRepository(storage);
  const sessionSecret = process.env.CLARIS_SESSION_SECRET;
  if (!sessionSecret) throw new Error('CLARIS_SESSION_SECRET_REQUIRED');
  const service = createCalibrationService({ repository, sessionSecret, buildLifecycleRecord });
  cached = { storage, repository, service };
  return cached;
}
