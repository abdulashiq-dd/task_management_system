const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const OWNER = randomUUID();
const ID = 'task-api-single-instance';
const LEASE_MS = 60000;
let renewInterval, deadline, renewal, acquired = false;
function collection() { return mongoose.connection.db.collection('runtimeleases'); }
function failClosed(error) { logger.error('Runtime lease lost; stopping process', error); process.exit(1); }
function armDeadline(expiresAt) { clearTimeout(deadline); const remaining = expiresAt.getTime() - Date.now() - 10000; if (remaining <= 0) failClosed(new Error("Runtime lease heartbeat was delayed")); deadline = setTimeout(() => failClosed(new Error("Runtime lease heartbeat expired")), remaining); }
async function acquireRuntimeLease() {
  const now = new Date();
  try {
    const record = await collection().findOneAndUpdate({ _id: ID, $or: [{ expiresAt: { $lte: now } }, { owner: OWNER }] }, { $set: { owner: OWNER, expiresAt: new Date(now.getTime() + LEASE_MS) } }, { upsert: true, returnDocument: 'after', maxTimeMS: 5000 });
    if (!record || record.owner !== OWNER) throw new Error('Another API instance owns the runtime lease');
  } catch (error) {
    if (error.code === 11000) throw new Error('Another API instance owns the runtime lease; stop it or wait for lease expiry');
    throw error;
  }
  acquired = true; armDeadline(new Date(now.getTime() + LEASE_MS));
  renewInterval = setInterval(() => {
    if (renewal) return;
    const now = new Date();
    renewal = collection().updateOne({ _id: ID, owner: OWNER, expiresAt: { $gt: now } }, { $set: { expiresAt: new Date(now.getTime() + LEASE_MS) } }, { maxTimeMS: 5000 }).then(result => {
      if (result.matchedCount !== 1) throw new Error('Runtime lease expired');
      armDeadline(new Date(now.getTime() + LEASE_MS));
    }).catch(failClosed).finally(() => { renewal = null; });
  }, 10000);
}
async function releaseRuntimeLease() {
  if (!acquired) return;
  clearInterval(renewInterval);
  await renewal;
  clearTimeout(deadline);
  await collection().deleteOne({ _id: ID, owner: OWNER });
  acquired = false;
}
module.exports = { acquireRuntimeLease, releaseRuntimeLease };
