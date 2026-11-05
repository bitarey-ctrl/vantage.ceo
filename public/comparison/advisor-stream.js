/* Advisor stream outcome and conversation-saving rules. Pure functions, shared by the browser client and tests. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AdvisorStream=api;})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 /* Incremental server-sent-event parser. Returns parsed data payloads; an unreadable payload is reported, not thrown. */
 function createParser(){let buffer='';return {feed(text,final=false){buffer+=text;const out=[];let end;while((end=buffer.indexOf('\n\n'))!==-1||(final&&buffer.trim())){const event=end===-1?buffer:buffer.slice(0,end);buffer=end===-1?'':buffer.slice(end+2);for(const line of event.replace(/\r/g,'').split('\n')){if(!line.startsWith('data:'))continue;const raw=line.slice(5).trim();if(!raw)continue;if(raw==='[DONE]'){out.push({legacyDone:true});continue;}try{out.push(JSON.parse(raw));}catch{out.push({malformed:true});}}if(end===-1)break;}return out;}};}
 const LABEL={complete:'Advisor response · check claims',max_tokens:'Stopped at the length limit · this answer is incomplete',refusal:'The Advisor declined to answer this',cancelled:'You stopped this answer · it is incomplete',transport:'Connection lost before the answer finished · it may be incomplete',error:'The Advisor could not finish · this answer is incomplete',incomplete:'This answer did not finish · it may be incomplete'};
 /* The one rule: an answer is complete only when the server said so with a terminal "end: complete" event.
    A dropped connection, a token-limit cut-off, a refusal, a Stop, or a legacy "[DONE]" are never "complete". */
 function outcome({end=null,error=null,aborted=false,malformed=false}={}){
  let status;
  if(aborted)status='cancelled';
  else if(error)status='error';
  else if(malformed)status='error';
  else if(end&&['complete','max_tokens','refusal','incomplete'].includes(end.status))status=end.status;
  else status='transport';
  const message=status==='complete'?'':status==='error'?(error?.message||'The Advisor could not finish this answer. Nothing was changed.'):LABEL[status];
  return {status,complete:status==='complete',incomplete:status!=='complete',label:LABEL[status],message};
 }
 /* Label for a saved message, including messages saved before statuses existed. */
 function label(m){if(m?.status&&LABEL[m.status])return LABEL[m.status];return m?.incomplete?'Response stopped · may be incomplete':LABEL.complete;}
 /* A retry keeps the earlier unfinished text (at most three earlier attempts) instead of overwriting it. */
 function withAttempt(next,prior){if(!prior||prior.role!=='assistant'||!String(prior.content||'').trim())return next;const attempts=[...(prior.attempts||[]),{content:prior.content,status:prior.status||(prior.incomplete?'incomplete':'complete'),at:prior.at||null}].slice(-3);return {...next,attempts};}
 /* Fields that are never stored. */
 function forSave(messages){return (messages||[]).map(m=>{const out={role:m.role,content:String(m.content||'')};if(m.role==='assistant'){const status=m.status||(m.incomplete?'incomplete':'complete');out.status=status;if(status!=='complete')out.incomplete=true;if(m.attempts?.length)out.attempts=m.attempts.slice(-3).map(a=>({content:String(a.content||''),status:a.status||'incomplete',at:a.at||null}));}if(m.turnId)out.turnId=m.turnId;if(m.at)out.at=m.at;return out;});}
 /* Concurrent edit: the stored conversation changed elsewhere. Keep everything stored, then add only our turns that
    are not already there (matched by turn id). Nothing is overwritten and nothing is duplicated. */
 function mergeConflict(stored,local,pendingTurnIds){const out=[...(stored||[])];const have=new Set(out.filter(m=>m.turnId).map(m=>m.role+':'+m.turnId));const add=(local||[]).filter(m=>m.turnId&&pendingTurnIds.includes(m.turnId)&&!have.has(m.role+':'+m.turnId));for(const m of add){/* place an answer right after its own question when that question is stored */let at=-1;for(let i=out.length-1;i>=0;i--)if(out[i].turnId===m.turnId){at=i;break;}if(at===-1)out.push(m);else out.splice(at+1,0,m);}return {messages:out,added:add.length};}
 /* Messages the model should see: no unfinished answers, no empty text. */
 function forModel(messages){return (messages||[]).filter(m=>!(m.role==='assistant'&&(m.incomplete||(m.status&&m.status!=='complete')))&&String(m.content||'').trim()).map(({role,content})=>({role,content}));}
 return Object.freeze({createParser,outcome,label,withAttempt,forSave,mergeConflict,forModel,LABEL});
});
