const test = require('node:test');
const assert = require('node:assert/strict');
const { taskFields } = require('../src/utils/taskFields');
const { authRateLimit } = require('../src/middleware/authRateLimit');
const { validateEnvironment } = require('../src/config/env');
const { pagination, pageInfo } = require('../src/utils/pagination');
const { notificationJob } = require('../src/events/taskNotificationListener');
const { activityJob } = require('../src/events/taskActivityListener');
const errorHandler = require('../src/middleware/errorMiddleware');
const { isRetryableError } = require('../src/utils/jobErrors');
function response() { return { code: 200, headers: {}, set(k, v) { this.headers[k] = v; return this; }, status(v) { this.code = v; return this; }, json(v) { this.body = v; return this; } }; }
test('A1/A2: reject protected fields, Mongo operators, empty/nonobject bodies', () => {
  for (const field of ['createdBy','assignedTo','isOverdue','overdueAt','pendingEvents','__v','$set']) assert.throws(() => taskFields({ title:'Test', [field]:true }), {statusCode:400});
  for (const value of [undefined, null, [], {}, 'text']) assert.throws(() => taskFields(value), {statusCode:400});
  assert.deepEqual(taskFields({ title:'Task', tags:['a'] }), { title:'Task', tags:['a'] });
});
test('A6: per-IP limit returns 429 and retry header; another IP is independent', () => {
  const limit = authRateLimit({limit:2}); let accepted=0;
  for(let i=0;i<3;i++) { const res=response(); limit({ip:'1.2.3.4'},res,()=>accepted++); assert.equal(res.code,i===2?429:200); if(i===2) assert.ok(Number(res.headers['Retry-After'])>0); }
  const res=response(); limit({ip:'1.2.3.5'},res,()=>accepted++); assert.equal(res.code,200); assert.equal(accepted,3);
});
test('A6: memory cap fails closed for new keys', () => {
  const limit = authRateLimit({limit:2,maxKeys:1}); limit({ip:'one'}, response(), ()=>{}); const res=response(); limit({ip:'two'},res,()=>assert.fail()); assert.equal(res.code,429);
});
test('A7: missing environment fails without printing secret', () => {
  assert.throws(()=>validateEnvironment({}),/MONGO_URI, JWT_SECRET/); assert.throws(()=>validateEnvironment({MONGO_URI:'mongodb://localhost',JWT_SECRET:' '}),/JWT_SECRET/); assert.doesNotThrow(()=>validateEnvironment({MONGO_URI:'mongodb://localhost',JWT_SECRET:'secret'}));
});
test('C4/C5: pagination validates and bounds input', () => {
  assert.deepEqual(pagination({page:'2',limit:'10'}),{page:2,limit:10,skip:10});
  for(const value of ['0','-1','1.5','1e2',[],{},'101']) assert.throws(()=>pagination({limit:value}),{statusCode:400});
  assert.equal(pageInfo(2,10,21).hasNextPage,true); assert.equal(pageInfo(3,10,21).hasNextPage,false);
});
test('B7/B8: snapshot maps to deterministic notification and activity IDs', () => {
  const event={id:'one',eventType:'taskUpdated',data:{taskId:'task',performedBy:'actor',recipient:'user',title:'Task',details:{previousPriority:'low',newPriority:'high'}}};
  assert.equal(activityJob(event).id,'activity:one'); const job=notificationJob(event); assert.equal(job.id,'notification:one'); assert.equal(job.userId,'user'); assert.match(job.payload.message,/low to high/);
});
test('B8: unchanged priority/assignee does not notify', () => {
  assert.equal(notificationJob({eventType:'taskUpdated',data:{details:{previousPriority:'low',newPriority:'low'}}}),null);
  assert.equal(notificationJob({eventType:'taskAssigned',data:{details:{previousAssignee:'a',assignedTo:'a'}}}),null);
});
test('D1: duplicate non-email key is not reported as email', () => {
  const a=response(), b=response(); errorHandler({code:11000,keyPattern:{email:1}}, {},a,()=>{}); errorHandler({code:11000,keyPattern:{backgroundJobId:1}}, {},b,()=>{}); assert.equal(a.code,409); assert.equal(b.code,409); assert.match(a.body.message,/Email/); assert.doesNotMatch(b.body.message,/Email/);
});
test('D1: error handler delegates after headers are sent', () => { const res=response(); res.headersSent=true; const err=new Error('test'); let actual; errorHandler(err,{},res,e=>actual=e); assert.equal(actual,err); });
test('B3: explicitly nonretryable timeout will not be retried',()=>assert.equal(isRetryableError(Object.assign(new Error('timeout'),{retryable:false})),false));
