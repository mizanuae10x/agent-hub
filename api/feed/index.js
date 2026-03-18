const { BlobServiceClient } = require('@azure/storage-blob');
const CONN = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER = 'hub-data';

module.exports = async function(context, req) {
  try {
    const c = BlobServiceClient.fromConnectionString(CONN).getContainerClient(CONTAINER);
    const buf = await c.getBlobClient('feed.json').downloadToBuffer();
    const feed = JSON.parse(buf.toString());
    const limit = parseInt(req.query?.limit || 100);
    context.res = { status: 200, body: feed.slice(-limit).reverse() };
  } catch {
    context.res = { status: 200, body: [] };
  }
};
