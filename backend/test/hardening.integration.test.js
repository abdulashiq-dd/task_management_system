const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { randomUUID } = require('node:crypto');
if (!/\/task_hardening_test_[a-f0-9]{32}(?:\?|$)/.test(process.env.MONGO_URI || '')) throw new Error('Run through npm test only');
process.env.JOB_QUEUE_MODE = 'mongo';
const app = require('../src/app');
const Task = require('../src/models/taskModel');
const User = require('../src/models/userModel');
const Notification = require('../src/models/notificationModel');
const TaskActivity = require('../src/models/taskActivityModel');
const BackgroundJob = require('../src/models/backgroundJobModel');
const { Export } = require('../src/models/exportModel');
const { jobQueue, JOB_TYPES, JobQueue } = require('../src/queues/jobQueue');
const { acquireRuntimeLease, releaseRuntimeLease } = require('../src/config/runtimeLease');
const { MongoJobQueue } = require('../src/queues/mongoJobQueue');
const { JobWorker, jobWorker } = require('../src/workers/jobWorker');
const { executeJob } = require('../src/workers/jobHandlers');
const { startOutbox, stopOutbox, flushTaskEvents } = require('../src/events/taskOutbox');
const { processOverdueTasks } = require('../src/services/reminderService');
const taskService = require('../src/services/taskService');
const { queueExportJob, processExportJob } = require('../src/services/exportJobService');
const { FILE_TYPES, deleteFile } = require('../src/config/fileStorage');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { sleep } = require('../src/utils/retry');
const { encryptedPassword } = require('./helpers/encryptedPassword');
let server, baseUrl, passed = 0;
function current(user) { return { id: String(user._id), role: user.role }; }
const token = user => jwt.sign({ sub:String(user._id) }, process.env.JWT_SECRET, { algorithm:'HS256', expiresIn:'1h' });
async function request(method,path,user,body) {
  const headers = user ? { Authorization:`Bearer ${token(user)}` } : {};
  if (body !== undefined) headers['Content-Type']='application/json';
  const res=await fetch(baseUrl+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}); const text=await res.text(); let data;try{data=JSON.parse(text);}catch{data=text;}return{status:res.status,data};
}
async function check(name,fn){ await fn(); passed++; console.log(`[PASS] ${name}`); }
async function until(fn){ const end=Date.now()+15000;while(Date.now()<end){const result=await fn();if(result)return result;await sleep(50);}throw new Error('Timed out waiting for durable job'); }
async function main(){
  await mongoose.connect(process.env.MONGO_URI);
  await Promise.all([Task, User, Notification, TaskActivity, Export, BackgroundJob, require('../src/models/passwordChallengeModel')].map(Model=>Model.createIndexes()));
  await BackgroundJob.deleteMany({}); // Disconnected, disposable database only.
  const suffix=randomUUID();
  const passwordHash=await bcrypt.hash(randomUUID(),12);
  const [creator,assignee,other,admin]=await User.create(['user','user','user','admin'].map((role,i)=>({name:`Fixture ${i}`,email:`${suffix}-${i}@example.invalid`,password:passwordHash,role})));
  await new Promise(resolve=>{server=app.listen(0,'127.0.0.1',resolve);});baseUrl=`http://127.0.0.1:${server.address().port}`;
  let taskId;
  await check('A1: create rejects protected fields and unauthenticated calls',async()=>{
    for(const field of ['createdBy','assignedTo','isOverdue','overdueAt','pendingEvents'])assert.equal((await request('POST','/api/tasks',creator,{title:'blocked',[field]:String(other._id)})).status,400);
    assert.equal((await request('POST','/api/tasks',null,{title:'blocked'})).status,401);
    const res=await request('POST','/api/tasks',creator,{title:'Hardening task',priority:'high'});assert.equal(res.status,201);taskId=res.data.task._id;assert.equal(res.data.task.createdBy,String(creator._id));assert.equal(Object.hasOwn(res.data.task,'pendingEvents'),false);
  });
  await check('A2: update service rejects protected fields even without HTTP controller',async()=>{
    await assert.rejects(()=>taskService.updateTask(taskId,{assignedTo:other._id},current(creator)),{statusCode:400});
    assert.equal((await request('PATCH',`/api/tasks/${taskId}`,creator,{createdBy:String(other._id)})).status,400);
  });
  await check('F1: creator, assignee, other and admin permission matrix',async()=>{
    assert.equal((await request('PATCH',`/api/tasks/${taskId}/assign`,other,{assignedTo:String(assignee._id)})).status,403);
    assert.equal((await request('PATCH',`/api/tasks/${taskId}/assign`,creator,{assignedTo:String(assignee._id)})).status,200);
    for(const user of [creator,assignee,admin])assert.equal((await request('GET',`/api/tasks/${taskId}`,user)).status,200);
    assert.equal((await request('GET',`/api/tasks/${taskId}`,other)).status,403);
    for(const user of [assignee,other]){
      assert.equal((await request('PATCH',`/api/tasks/${taskId}`,user,{title:'Denied'})).status,403);
      assert.equal((await request('DELETE',`/api/tasks/${taskId}`,user)).status,403);
      assert.equal((await request('PATCH',`/api/tasks/${taskId}/assign`,user,{assignedTo:String(other._id)})).status,403);
    }
    assert.equal((await request('PATCH',`/api/tasks/${taskId}`,admin,{priority:'medium'})).status,200);
    assert.equal((await request('PATCH',`/api/tasks/${taskId}`,creator,{status:'completed'})).status,200);
    for(const user of [creator,assignee,admin]){const res=await request('GET','/api/tasks?search=Hardening',user);assert.equal(res.status,200);assert.ok(res.data.tasks.some(t=>t._id===taskId));}
    assert.equal((await request('GET','/api/tasks?search=Hardening',other)).data.tasks.length,0);
  });
  await check('A3: missing task assignment returns 404',async()=>assert.equal((await request('PATCH',`/api/tasks/${new mongoose.Types.ObjectId()}/assign`,creator,{assignedTo:String(assignee._id)})).status,404));
  await check('B7: task survives queue outage with durable event, delivered after recovery',async()=>{
    const prior=jobQueue.maxActiveJobs;jobQueue.maxActiveJobs=0;
    let id;try{const res=await request('POST','/api/tasks',creator,{title:'Outbox outage fixture'});assert.equal(res.status,201);id=res.data.task._id;assert.equal((await Task.findById(id).select('+pendingEvents')).pendingEvents.length,1);}finally{jobQueue.maxActiveJobs=prior;}
    await flushTaskEvents(id);assert.equal((await Task.findById(id).select('+pendingEvents')).pendingEvents.length,0);assert.equal(await BackgroundJob.countDocuments({'payload.task':id}),1);
  });
  await check('B5: startup lease prevents a second instance',async()=>{
    const locks=mongoose.connection.db.collection('runtimeleases');
    await locks.insertOne({_id:'task-api-single-instance',owner:'other-process',expiresAt:new Date(Date.now()+60000)});
    try{await assert.rejects(()=>acquireRuntimeLease(),/Another API instance/);}finally{await locks.deleteOne({_id:'task-api-single-instance',owner:'other-process'});}
    await acquireRuntimeLease();await releaseRuntimeLease();assert.equal(await locks.countDocuments({_id:'task-api-single-instance'}),0);
  });
  await check('B1/B2: persisted jobs survive new queue instance and enforce export quota',async()=>{
    const owner=String(other._id);const q=new MongoJobQueue({maxUserJobs:1});
    const submitted=await q.enqueue(JOB_TYPES.JSON_EXPORT,{fixture:true},owner);
    assert.equal((await new MongoJobQueue().getJob(submitted.id)).status,'pending');
    await assert.rejects(()=>q.enqueue(JOB_TYPES.CSV_EXPORT,{},owner),{statusCode:429});
    // Remove synthetic job before real worker starts.
    await BackgroundJob.deleteOne({id:submitted.id});
  });
  await check('B1: atomic claims and interrupted-job recovery',async()=>{
    const q=new MongoJobQueue();
    const doc=await q.enqueue(JOB_TYPES.ACTIVITY_LOG,{fixture:true},String(admin._id));
    // Isolate atomic claim test by using a dedicated model backed by the same collection and filtering other jobs temporarily.
    const existing=await BackgroundJob.find({id:{$ne:doc.id},status:'pending'}).select('id').lean();
    await BackgroundJob.updateMany({id:{$in:existing.map(j=>j.id)}},{$set:{status:'retrying',nextRetryAt:new Date(Date.now()+60000)}});
    const claims=await Promise.all([q.dequeue(),new MongoJobQueue().dequeue()]);
    assert.equal(claims.filter(Boolean).length,1);assert.equal(claims.find(Boolean).id,doc.id);
    await q.recoverInterrupted();assert.equal((await q.getJob(doc.id)).status,'retrying');
    await BackgroundJob.deleteOne({id:doc.id});await BackgroundJob.updateMany({id:{$in:existing.map(j=>j.id)}},{$set:{status:'pending',nextRetryAt:null}});
  });
  await check('B7/B8: actual notification and activity jobs persist and execute once',async()=>{
    await flushTaskEvents(taskId);
    assert.equal((await Task.findById(taskId).select('+pendingEvents')).pendingEvents.length,0);
    const jobs=await BackgroundJob.find({'payload.task':taskId}).lean();assert.ok(jobs.length>=5);
    jobWorker.start();startOutbox();
    await until(async()=>await BackgroundJob.countDocuments({'payload.task':taskId,status:{$ne:'completed'}})===0);
    const activity=await TaskActivity.find({task:taskId});const notices=await Notification.find({task:taskId});
    assert.ok(activity.some(row=>row.eventType==='taskCompleted'));assert.ok(notices.some(n=>n.type==='taskAssigned' && String(n.user)===String(assignee._id)));
    const job=jobs.find(j=>j.type===JOB_TYPES.ACTIVITY_LOG);await executeJob(job);assert.equal(await TaskActivity.countDocuments({backgroundJobId:job.id}),1);
  });
  await check('C4/C5: paginated notifications and jobs; private keys not exposed',async()=>{
    const n=await request('GET','/api/notifications?page=1&limit=1',assignee);assert.equal(n.status,200);assert.equal(n.data.notifications.length,1);assert.equal(n.data.pagination.limit,1);assert.ok(!Object.hasOwn(n.data.notifications[0],'backgroundJobId'));assert.ok(!Object.hasOwn(n.data.notifications[0],'deduplicationKey'));
    const a=await request('GET','/api/activity?page=1&limit=1',assignee);assert.equal(a.status,200);assert.equal(a.data.activities.length,1);assert.equal(a.data.pagination.limit,1);assert.equal(a.data.activities[0].taskTitle,'Hardening task');assert.ok(!Object.hasOwn(a.data.activities[0],'backgroundJobId'));
    const hidden=await request('GET','/api/activity',other);assert.equal(hidden.status,200);assert.equal(hidden.data.activities.length,0);
    const j=await request('GET','/api/jobs?page=1&limit=1',admin);assert.equal(j.status,200);assert.equal(j.data.jobs.length,1);assert.ok(j.data.pagination.total>1);
  });
  await check('A4: queued admin export runs with demoted role and correct task scope',async()=>{
    await jobWorker.stop(); const queued=await queueExportJob(FILE_TYPES.JSON,current(admin),{search:'Hardening task'});await User.updateOne({_id:admin._id},{$set:{role:'user'}});jobWorker.start();
    await until(async()=>{const j=await jobQueue.getJob(queued.id);if(j.status==='failed')throw Error('Demoted export failed');return j.status==='completed';});
    const file=await request('GET',`/api/exports/${queued.exportId}/download`,admin);assert.equal(file.status,200);assert.deepEqual(file.data,[]);
    await User.updateOne({_id:admin._id},{$set:{role:'admin'}});
    const record=await Export.findById(queued.exportId);await deleteFile(record.type,record.fileName);
    assert.equal((await request('GET',`/api/exports/${queued.exportId}/download`,admin)).status,404);
  });
  await check('B6: overdue task processed once and reminder dedup preserved',async()=>{
    const t=await Task.create({title:'Overdue fixture',createdBy:creator._id,dueDate:new Date(Date.now()-3600000)});await processOverdueTasks(new Date());assert.equal((await Task.findById(t._id)).isOverdue,true);await processOverdueTasks(new Date());assert.equal(await Notification.countDocuments({task:t._id,type:'taskOverdue'}),1);
  });
  await check('B3: hung isolated educational worker reaches deadline without retry',async()=>{
    const queue=new JobQueue();const worker=new JobWorker({queue,handler:()=>new Promise(()=>{}),pollIntervalMs:10,timeoutMs:30});const j=queue.enqueue(JOB_TYPES.ACTIVITY_LOG,{});worker.start();await until(()=>queue.getJob(j.id).status==='failed');await worker.stop();assert.equal(queue.getJob(j.id).attempts,1);
  });
  await check('D2/A5: register without body is 400; incorrect and nonexistent login are 401',async()=>{
    assert.equal((await request('POST','/api/auth/register',null)).status,400);
    for(const email of [creator.email,'unknown@example.invalid']) {
      const credentials = await encryptedPassword(baseUrl, 'login', email, 'not-correct');
      assert.equal((await request('POST','/api/auth/login',null,credentials)).status,401);
    }
  });
  await check('F1: creator and admin deletion authorized',async()=>{
    const a=(await request('POST','/api/tasks',creator,{title:'Delete me'})).data.task._id;
    assert.equal((await request('DELETE',`/api/tasks/${a}`,creator)).status,200);
    assert.equal((await request('DELETE',`/api/tasks/${taskId}`,admin)).status,200);
  });
  console.log(`ALL ${passed} HARDENING INTEGRATION GROUPS PASSED`);
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await stopOutbox();if(server?.listening)await new Promise(resolve=>server.close(resolve));await jobWorker.stop();await releaseRuntimeLease();await mongoose.disconnect();});
