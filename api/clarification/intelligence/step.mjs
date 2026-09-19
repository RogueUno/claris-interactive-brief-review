export default {
  async fetch() {
    return new Response(JSON.stringify({ ok: true, diagnostic: 'clarification-protocol-route' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }
};
