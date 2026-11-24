// Read-only; print index names and execution plan summaries, never task/user contents.
require('dotenv').config();
const mongoose=require('mongoose');
(async()=>{
  if(!process.env.MONGO_URI)throw Error('MONGO_URI must be configured');
  await mongoose.connect(process.env.MONGO_URI,{autoIndex:false,autoCreate:false});
  for(const name of ['tasks','notifications','taskactivities','backgroundjobs']){
    const collection=mongoose.connection.db.collection(name);
    try {const indexes=await collection.indexes();console.log(name,indexes.map(({name,key,expireAfterSeconds})=>({name,key,expireAfterSeconds})));}catch(error){if(error.code!==26)throw error;console.log(name,'not initialized');}
  }
  const user=await mongoose.connection.db.collection('users').findOne({},{projection:{_id:1}});
  if(user){const tasks=mongoose.connection.db.collection('tasks');for(const field of ['createdBy','assignedTo']){const result=await tasks.find({[field]:user._id,status:'pending'}).explain('executionStats');console.log(field,JSON.stringify({winningPlan:result.queryPlanner.winningPlan,totalDocsExamined:result.executionStats.totalDocsExamined,nReturned:result.executionStats.nReturned}));}}
})().catch(error=>{console.error(error.name);process.exitCode=1;}).finally(()=>mongoose.disconnect());
