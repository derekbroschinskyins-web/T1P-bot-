import {useEffect,useState} from 'react';
import {periodOf} from './progression';
import {dayKey} from './strategy';
const clock=()=>dayKey()+':'+periodOf({createdAt:new Date().toISOString()});
export function useWorkBlock(){const [value,setValue]=useState(clock);useEffect(()=>{const tick=()=>setValue(clock());const timer=setInterval(tick,1000);window.addEventListener('focus',tick);document.addEventListener('visibilitychange',tick);return()=>{clearInterval(timer);window.removeEventListener('focus',tick);document.removeEventListener('visibilitychange',tick)}},[]);return value.split(':')[1] as 'morning'|'afternoon'}
