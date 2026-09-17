import { get, put } from '@vercel/blob';

export function createVercelBlobJsonStorage({ token = process.env.BLOB_READ_WRITE_TOKEN } = {}) {
  if (!token) throw new Error('BLOB_READ_WRITE_TOKEN_REQUIRED');
  return {
    async getJson(pathname) {
      const result = await get(pathname, { access: 'private', token });
      if (!result || result.statusCode === 404) return null;
      if (result.statusCode !== 200) throw new Error(`BLOB_GET_FAILED:${result.statusCode}`);
      return new Response(result.stream).json();
    },
    async putJson(pathname, value) {
      return put(pathname, JSON.stringify(value), {
        access: 'private',
        token,
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json'
      });
    }
  };
}
