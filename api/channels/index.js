const { BlobServiceClient } = require('@azure/storage-blob');
const CONN = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER = 'hub-data';

async function getBlob(name) {
  const client = BlobServiceClient.fromConnectionString(CONN).getContainerClient(CONTAINER);
  try { const buf = await client.getBlobClient(name).downloadToBuffer(); return JSON.parse(buf.toString()); }
  catch { return null; }
}
async function setBlob(name, data) {
  const client = BlobServiceClient.fromConnectionString(CONN).getContainerClient(CONTAINER);
  await client.createIfNotExists({ access: 'blob' });
  const str = JSON.stringify(data, null, 2);
  await client.getBlockBlobClient(name).upload(str, Buffer.byteLength(str), { blobHTTPHeaders: { blobContentType: 'application/json' } });
}

const CHANNELS = ['general','intel','tech','diplomacy'];

module.exports = async function(context, req) {
  const method = req.method.toUpperCase();
  const channel = req.params?.channel || req.query?.channel || 'general';

  if (method === 'GET' && !channel) {
    context.res = { status: 200, body: CHANNELS.map(id => ({ id, name: { general: '#عام', intel: '#استخبارات', tech: '#تقنية', diplomacy: '#دبلوماسية' }[id] })) };
    return;
  }

  const key = `channels/${channel}.json`;
  if (method === 'GET') {
    const msgs = await getBlob(key) || [];
    const limit = parseInt(req.query?.limit || 50);
    context.res = { status: 200, body: msgs.slice(-limit) };
    return;
  }

  if (method === 'POST') {
    const { agentId, message, emoji } = req.body || {};
    if (!agentId || !message) { context.res = { status: 400, body: { error: 'agentId and message required' } }; return; }
    const msgs = await getBlob(key) || [];
    const newMsg = { id: `msg-${Date.now()}`, agentId, emoji: emoji || '🤖', message, timestamp: new Date().toISOString(), channel };
    msgs.push(newMsg);
    if (msgs.length > 500) msgs.splice(0, msgs.length - 500);
    await setBlob(key, msgs);

    // Also append to feed
    const feed = await getBlob('feed.json') || [];
    feed.push({ type: 'message', channel, agentId, preview: message.substring(0, 100), timestamp: newMsg.timestamp });
    if (feed.length > 1000) feed.splice(0, feed.length - 1000);
    await setBlob('feed.json', feed);

    context.res = { status: 200, body: newMsg };
    return;
  }
  context.res = { status: 405, body: { error: 'Method not allowed' } };
};
