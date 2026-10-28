/* Local decision-support rules. No model call, research, ranking or readiness score. */
(function(root, factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DecisionEngine=api;})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const clone=x=>JSON.parse(JSON.stringify(x));
 const text=x=>typeof x==='string'?x.trim():'';
 const opts=d=>Array.isArray(d.alternatives_considered)?d.alternatives_considered:[];
 const support=d=>d.support||{};
 const selected=(d,id)=>opts(d).find(o=>o.id===id)||null;
 const validDate=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+'T12:00:00Z'))&&new Date(x+'T12:00:00Z').toISOString().slice(0,10)===x;
 function diagnose(d,selectedId){
  const s=support(d),o=selected(d,selectedId),e=s.evidence||[],gaps=[];
  if(!text(s.goal))gaps.push({key:'goal',label:'Name the result you want',why:'Options need the same yardstick. A sentence is enough.',action:'frame'});
  if(!opts(d).length)gaps.push({key:'options',label:'Write one possible response',why:'Include what you would keep doing, or one change worth considering.',action:'option'});
  const open=e.filter(e=>['assumption','unknown'].includes(e.kind)&&e.decisive);
  if(open.length&&!s.learning?.check)gaps.push({key:'evidence',label:'Choose how to check the key uncertainty',why:open[0].claim,action:'learning'});
  if(opts(d).length&&!o)gaps.push({key:'selection',label:'Compare, then choose an option to record',why:'Nothing is selected for you. Selecting here still does not commit.',action:'compare'});
  const warnings=[];
  if(opts(d).length===1)warnings.push('Only one response is written down. You can still record it; consider what happens if you wait.');
  if(!text(s.limit))warnings.push('No hard limit is written down. If none applies, say so; this is not a completion test.');
  if(!e.some(x=>x.kind==='business'))warnings.push('No business evidence is attached. External news does not establish your customer response.');
  if(o?.fit==='outside')warnings.push('You marked this option outside your limit. Change its scope or explicitly explain the exception.');
  if(o?.fit==='unknown')warnings.push('The selected option has not been checked against your limit.');
  if(o?.needsReview)warnings.push('Your goal or limit changed. Recheck this response before relying on its earlier assessment.');
  if(d.deadline&&s.learning?.date&&s.learning.date>d.deadline)warnings.push('Your planned check is after your decision date. Narrow the check, accept the uncertainty, or move the date.');
  if(o?.reversibility==='hard')warnings.push('You marked this hard to reverse. Consider a narrower commitment or an outside review.');
  return {next:gaps[0]||{key:'choice',label:'Make the call when the trade-off is worth it',why:'The record is a thinking aid. It cannot certify that the evidence is sufficient.',action:'record'},gaps,warnings,selected:o,assumptions:open};
 }
 function contextPacket(d){const s=support(d);return {question:d.title,whyNow:d.description||'',goal:s.goal||null,limit:s.limit||null,deadline:d.deadline||null,options:opts(d).map(o=>({id:o.id,title:o.title||o.description,expected:o.expected||null,downside:o.reasonRejected||null,effort:o.effort||null,limitFit:o.fit||'unknown',reversibility:o.reversibility||'unknown',firstStep:o.next||null,needsReview:Boolean(o.needsReview)})),evidence:clone(s.evidence||[]),learning:clone(s.learning||null),scenario:clone(s.scenario||null),limitations:['Supplied records only. Source labels do not verify a claim.','No source retrieval, option ranking, forecast or business execution.']};}
 function reframe(d,input){if(d.status!=='open')throw new Error('Reconsider a recorded choice in a new decision.');const out=clone(d),old=support(d),changed=text(old.goal)!==text(input.goal)||text(old.limit)!==text(input.limit),limitChanged=text(old.limit)!==text(input.limit);out.support={...support(out),goal:text(input.goal),limit:text(input.limit)};out.deadline=input.deadline||null;if(changed)out.alternatives_considered.forEach(o=>{o.needsReview=true;if(limitChanged)o.fit='unknown';});return out;}
 function record(d,input,at){
  if(d.status!=='open')throw new Error('This choice is already recorded or archived. Reconsider it in a new decision.');
  const o=selected(d,input.optionId);if(!o)throw new Error('Choose an option explicitly.');
  if(!text(input.why)||!text(input.next))throw new Error('Keep a reason and a next step with your choice.');
  if(input.review&&!validDate(input.review))throw new Error('Choose a valid review date.');
  if(!text(input.expected)&&!text(input.uncertainty))throw new Error('Record an expectation, or explicitly say what is still unknown.');
  if(o.fit==='outside'&&!text(input.exception))throw new Error('Explain the exception to your stated limit, or change the option.');
  const out=clone(d);out.alternatives_considered.forEach(x=>delete x.comparisonChoice);const picked=out.alternatives_considered.find(x=>x.id===o.id);
  picked.comparisonChoice={why:text(input.why),next:text(input.next),review:input.review||'',condition:text(input.condition),saved:at};
  out.rationale=text(input.why);out.status='decided';out.support={...support(out),snapshot:{at,optionId:o.id,optionTitle:o.title||o.description,why:text(input.why),expected:text(input.expected),uncertainty:text(input.uncertainty),next:text(input.next),review:input.review||'',condition:text(input.condition),exception:text(input.exception),context:contextPacket(d)},reviews:[]};return out;
 }
 function review(d,input,at){
  if(d.status!=='decided')throw new Error('Record a choice before reviewing an outcome.');
  if(!['observed','too-early'].includes(input.status)||!text(input.observed))throw new Error('Describe what you observed, or why it is too early.');
  if(input.status==='too-early'&&!validDate(input.nextReview))throw new Error('Choose when to check again.');
  const out=clone(d),s=support(out);out.support={...s,reviews:[...(s.reviews||[]),{at,status:input.status,observed:text(input.observed),executed:input.executed||'unknown',learned:text(input.learned),nextReview:input.nextReview||''}]};
  out.actual_outcome=input.status==='observed'?text(input.observed):null;return out;
 }
 function reconsider(d,id,at){const out=clone(d);out.id=id;out.title='Revisit: '+d.title;out.status='open';out.rationale='';out.actual_outcome=null;out.created_at=at;out.updated_at=at;out.deadline=null;out.alternatives_considered.forEach(o=>delete o.comparisonChoice);out.support={...support(out),parentId:d.id,snapshot:null,reviews:[],thread:[],threadContext:[]};return out;}
 function due(d,date){if(d.status!=='decided'||d.actual_outcome)return false;const reviews=support(d).reviews||[],last=reviews[reviews.length-1];const next=last?.status==='too-early'?last.nextReview:support(d).snapshot?.review||opts(d).find(o=>o.comparisonChoice)?.comparisonChoice?.review;return Boolean(next&&next<=date);}
 function scenario(input){
  const fields=['currentPrice','currentCustomers','newPrice','newCustomers'];
  if(fields.some(k=>input[k]===''||input[k]===null||input[k]===undefined))return {available:false,reason:'Add your own price and customer assumptions. Blank is not zero.'};
  const v=Object.fromEntries(fields.map(k=>[k,Number(input[k])]));if(Object.values(v).some(x=>!Number.isFinite(x)||x<0)||v.currentPrice===0||v.newPrice===0)return {available:false,reason:'Prices must be above zero. Customer counts must be zero or more.'};
  const current=v.currentPrice*v.currentCustomers,proposed=v.newPrice*v.newCustomers;
  return {available:true,current,proposed,delta:proposed-current,breakEvenCustomers:Math.ceil(current/v.newPrice),limitation:'Monthly revenue sensitivity only. No costs, churn prediction or probability of success.'};
 }
 return Object.freeze({diagnose,contextPacket,reframe,record,review,reconsider,due,scenario,validDate});
});
