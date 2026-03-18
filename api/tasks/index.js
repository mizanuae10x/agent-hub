const { BlobServiceClient } = require('@azure/storage-blob');
const CONN = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER = 'hub-data';

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
  const { fromAgent, toAgent, task, priority, taskId, status } = req.body || {};

  if (method === 'GET') {
    const agentId = req.query?.agentId;
    const tasks = await getBlob('tasks.json') || [];
    const filtered = agentId ? tasks.filter(t => t.toAgent === agentId || t.fromAgent === agentId) : tasks;
    context.res = { status: 200, body: filtered.slice(-100) };
    return;
  }
  if (method === 'POST' && !taskId) {
    const tasks = await getBlob('tasks.json') || [];
    const newTask = { id: `task-${Date.now()}`, fromAgent, toAgent, task, priority: priority || 'normal', status: 'pending', createdAt: new Date().toISOString() };
    tasks.push(newTask);
    await setBlob('tasks.json', tasks);
    context.res = { status: 200, body: newTask };
    return;
  }
  if (method === 'POST' && taskId) {
    const tasks = await getBlob('tasks.json') || [];
    const idx = tasks.findIndex(t => t.id === taskId);
    if (idx >= 0) { tasks[idx].status = status; tasks[idx].updatedAt = new Date().toISOString(); await setBlob('tasks.json', tasks); }
    context.res = { status: 200, body: tasks[idx] || {} };
    return;
  }
  context.res = { status: 405, body: { error: 'Method not allowed' } };
};
