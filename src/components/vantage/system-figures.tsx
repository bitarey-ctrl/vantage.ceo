'use client';
import { useEffect, useRef } from 'react';
import './system-figures.css';
/** Pure isometric linework; product meaning lives in the card copy. */
function Cube({x,y,active=false}:{x:number;y:number;active?:boolean}){return <g transform={`translate(${x} ${y})`} className={active?'sf-cube sf-active':'sf-cube'}><path d="M0 -20 35 -2 0 16 -35 -2Z"/><path d="M-35 -2v15L0 31l35-18V-2M0 16v15"/><path d="m-9 -6 18 9m-12-11 18 9" className="sf-detail"/>{active&&<circle cy="-2" r="3" className="sf-accent"/>}</g>}
export function SystemFigure({index}:{index:number}){
 const scene=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const el=scene.current, card=el?.closest<HTMLElement>('.figure-card');
  if(!el||!card)return;
  const media=matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
  let frame=0;
  const reset=()=>{cancelAnimationFrame(frame);el.style.setProperty('--mx','0');el.style.setProperty('--my','0');el.style.setProperty('--lit','0');};
  const move=(e:PointerEvent)=>{if(!media.matches)return;const rect=card.getBoundingClientRect();const x=Math.max(-1,Math.min(1,((e.clientX-rect.left)/rect.width-.5)*2));const y=Math.max(-1,Math.min(1,((e.clientY-rect.top)/rect.height-.5)*2));cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{el.style.setProperty('--mx',String(x));el.style.setProperty('--my',String(y));el.style.setProperty('--lit','1');});};
  card.addEventListener('pointermove',move);card.addEventListener('pointerleave',reset);media.addEventListener('change',reset);
  return()=>{reset();card.removeEventListener('pointermove',move);card.removeEventListener('pointerleave',reset);media.removeEventListener('change',reset);};
 },[]);
 return <div ref={scene} className={`sf-figure sf-${index}`} aria-hidden="true"><div className="sf-atmosphere"/><svg className="sf-drawing" viewBox="0 -10 320 230" fill="none">
{index===0?<><g className="sf-stack">{[54,36,18,0].map((y,i)=><g key={y} transform={`translate(160 ${70+y})`} opacity={.3+i*.2}><path d="M0 -43 92 0 0 43 -92 0Z"/><path d="M-92 0v10L0 53l92-43V0M0 43v10"/></g>)}</g><g className="sf-target"><ellipse cx="160" cy="70" rx="32" ry="15"/><ellipse cx="160" cy="70" rx="18" ry="8"/><path d="M116 49l88 42m-88 0 88-42" opacity=".5"/><circle cx="160" cy="70" r="3" className="sf-accent"/></g><path d="M46 154h40m148 0h40" strokeDasharray="2 5" opacity=".3"/></>:index===1?<><g className="sf-connections"><path d="m160 96-82-40m82 40 82-40m-82 40-82 51m82-51 82 51M160 30v133" strokeDasharray="2 5"/></g><Cube x={160} y={28}/><Cube x={78} y={68}/><Cube x={242} y={68}/><Cube x={78} y={143}/><Cube x={242} y={143}/><Cube x={160} y={174}/><Cube x={160} y={103} active/></>:<><g className="sf-planes">{[4,3,2,1,0].map((n)=><g key={n} transform={`translate(${78+n*29} ${80-n*12})`} opacity={1-n*.17}><path d="M0 -20 76 37v90L0 70Z"/><path d="m12 9 49 36m-49-15 35 26" className="sf-detail"/>{n===0&&<path className="sf-accent-stroke" d="m22 63 10 17 28-8"/>}</g>)}</g><path d="m74 171 75 27 100-44" strokeDasharray="2 5" opacity=".25"/></>}
</svg></div>}
