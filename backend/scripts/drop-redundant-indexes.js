require('dotenv').config();
const mongoose = require('mongoose');
(async () => {
  if (!process.argv.includes('--confirm')) throw new Error('Dry-run only: run npm run verify:indexes first; pass --confirm to remove redundant notification indexes.');
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  await mongoose.connect(process.env.MONGO_URI, { autoIndex: false, autoCreate: false });
  const coll = mongoose.connection.db.collection('notifications');
  const indexes = await coll.indexes();
  const exact = (index, keys) => JSON.stringify(Object.entries(index.key)) === JSON.stringify(keys) && !index.unique && !index.sparse && !index.partialFilterExpression && !index.collation;
  if (!indexes.some(index => exact(index, [['user',1],['createdAt',-1],['_id',-1]]))) throw new Error('Replacement index not present; start the new backend first.');
  for (const index of indexes) {
    if (exact(index, [['user',1]]) || exact(index, [['user',1],['createdAt',-1]])) {
      await coll.dropIndex(index.name);
      console.log('Removed redundant index:', index.name);
    }
  }
})().catch(error => { console.error(error.message); process.exitCode=1; }).finally(() => mongoose.disconnect());
