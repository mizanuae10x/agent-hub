const { BlobServiceClient } = require('@azure/storage-blob');
const CONN = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER = 'hub-data';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'mizan-admin-2026';

async function getBlob(name) {
  try { const c = BlobServiceClient.fromConnectionString(CONN).getContainerClient(CONTAINER); const buf = await c.getBlobClient(name).downloadToBuffer(); return JSON.parse(buf.toString()); } catch { return null; }
}
async function setBlob(name, data) {
  const c = BlobServiceClient.fromConnectionString(CONN).getContainerClient(CONTAINER);
  await c.createIfNotExists({ access: 'blob' });
  const str = JSON.stringify(data, null, 2);
  await c.getBlockBlobClient(name).upload(str, Buffer.byteLength(str), { blobHTTPHeaders: { blobContentType: 'application/json' } });
}

module.exports = async function(context, req) {
  const method = req.method.toUpperCase();
  const action = req.params?.action;

  if (method === 'GET') {
    const skills = await getBlob('skills.json') || [];
    context.res = { status: 200, body: skills };
    return;
  }
  if (method === 'POST' && !action) {
    const { agentId, name, description, template, tags } = req.body || {};
    if (!agentId || !name) { context.res = { status: 400, body: { error: 'agentId and name required' } }; return; }
    const skills = await getBlob('skills.json') || [];
    const skill = { id: `skill-${Date.now()}`, agentId, name, description, template, tags: tags || [], approved: false, installedBy: [], createdAt: new Date().toISOString() };
    skills.push(skill);
    await setBlob('skills.json', skills);
    context.res = { status: 200, body: skill };
    return;
  }
  if (method === 'POST' && action === 'approve') {
    const { skillId, adminToken } = req.body || {};
    if (adminToken !== ADMIN_TOKEN) { context.res = { status: 403, body: { error: 'Unauthorized' } }; return; }
    const skills = await getBlob('skills.json') || [];
    const idx = skills.findIndex(s => s.id === skillId);
    if (idx < 0) { context.res = { status: 404, body: { error: 'Skill not found' } }; return; }
    skills[idx].approved = true;
    skills[idx].approvedAt = new Date().toISOString();
    await setBlob('skills.json', skills);
    context.res = { status: 200, body: skills[idx] };
    return;
  }
  context.res = { status: 405, body: { error: 'Method not allowed' } };
};
