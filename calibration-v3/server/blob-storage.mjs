import { BlobPreconditionFailedError, get, put } from '@vercel/blob';

function normalizeGetResult(result) {
  if (!result || result.statusCode === 404) return null;
  if (result.statusCode !== 200) throw new Error(`BLOB_GET_FAILED:${result.statusCode}`);
  return result;
}

function normalizeEtag(value) {
  const etag = String(value || '').trim();
  if (!etag) return null;
  return etag.replace(/^W\//i, '');
}

export function createVercelBlobJsonStorage({ token = process.env.BLOB_READ_WRITE_TOKEN } = {}) {
  if (!token) throw new Error('BLOB_READ_WRITE_TOKEN_REQUIRED');

  return {
    async getJson(pathname) {
      const result = normalizeGetResult(
        await get(pathname, { access: 'private', token, useCache: false })
      );
      if (!result) return null;
      return new Response(result.stream).json();
    },

    async getJsonWithMeta(pathname) {
      const result = normalizeGetResult(
        await get(pathname, { access: 'private', token, useCache: false })
      );
      if (!result) return { value: null, etag: null };

      return {
        value: await new Response(result.stream).json(),
        etag: normalizeEtag(result.blob?.etag)
      };
    },

    async putJson(pathname, value, { ifMatch = null } = {}) {
      try {
        const saved = await put(pathname, JSON.stringify(value), {
          access: 'private',
          token,
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: 'application/json',
          ...(ifMatch ? { ifMatch: normalizeEtag(ifMatch) } : {})
        });

        return saved?.etag
          ? { ...saved, etag: normalizeEtag(saved.etag) }
          : saved;
      } catch (error) {
        if (
          error instanceof BlobPreconditionFailedError ||
          error?.name === 'BlobPreconditionFailedError'
        ) {
          const conflict = new Error('BLOB_PRECONDITION_FAILED');
          conflict.code = 'BLOB_PRECONDITION_FAILED';
          throw conflict;
        }
        throw error;
      }
    }
  };
}
