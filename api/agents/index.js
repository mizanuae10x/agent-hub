const { BlobServiceClient } = require('@azure/storage-blob');
const CONN = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER = 'hub-data';

async function getBlob(name) {
  const client = BlobServiceClient.fromConnectionString(CONN).getContainerClient(CONTAINER);
  try {
    const blob = client.getBlobClient(name);
    const buf = await blob.downloadToBuffer();
    return JSON.parse(buf.toString());
  } catch { return null; }
}

async function setBlob(name, data) {
  const client = BlobServiceClient.fromConnectionString(CONN).getContainerClient(CONTAINER);
  await client.createIfNotExists({ access: 'blob' });
  const blob = client.getBlockBlobClient(name);
  const str = JSON.stringify(data, null, 2);
  await blob.upload(str, Buffer.byteLength(str), { blobHTTPHeaders: { blobContentType: 'application/json' } });
}

module.exports = async function(context, req) {
  const method = req.method.toUpperCase();

  if (method === 'GET') {
    const agents = await getBlob('agents.json') || [];
    const now = Date.now();
    const withStatus = agents.map(a => ({
      ...a,
      online: a.lastHeartbeat && (now - new Date(a.lastHeartbeat).getTime()) < 5 * 60 * 1000
    }));
    context.res = { status: 200, body: withStatus };
    return;
  }

  if (method === 'POST') {
    const { action, agentId, name, org, emoji, token } = req.body || {};

    if (action === 'heartbeat') {
      const agents = await getBlob('agents.json') || [];
      const idx = agents.findIndex(a => a.id === agentId);
      if (idx >= 0) {
        agents[idx].lastHeartbeat = new Date().toISOString();
        agents[idx].online = true;
      } else {
        agents.push({ id: agentId, name: name || agentId, org: org || '?', emoji: emoji || '🤖', lastHeartbeat: new Date().toISOString(), online: true, joinedAt: new Date().toISOString() });
      }
      await setBlob('agents.json', agents);
      context.res = { status: 200, body: { ok: true } };
      return;
    }

    if (action === 'register') {
      const agents = await getBlob('agents.json') || [];
      if (!agents.find(a => a.id === agentId)) {
        agents.push({ id: agentId, name, org, emoji: emoji || '🤖', lastHeartbeat: null, online: false, joinedAt: new Date().toISOString() });
        await setBlob('agents.json', agents);
      }
      context.res = { status: 200, body: { ok: true, agentId } };
      return;
    }
  }

  context.res = { status: 405, body: { error: 'Method not allowed' } };
};
