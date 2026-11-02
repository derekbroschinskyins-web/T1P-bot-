import {useEffect,useRef,useState} from 'react';
import {Play,Pause,Volume2,VolumeX,X} from 'lucide-react';

export function Intro({onClose}:{onClose:()=>void}){
 const video=useRef<HTMLVideoElement>(null);
 const [started,setStarted]=useState(false),[playing,setPlaying]=useState(false),[muted,setMuted]=useState(true),[error,setError]=useState('');
 useEffect(()=>{const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=old}},[]);
 async function play(){setError('');try{await video.current?.play();setStarted(true);}catch{setError('Tap play to retry, or head straight to your desk.')}}
 return <div className="cinema-intro" role="dialog" aria-modal="true" aria-label="Derek’s garage film" onKeyDown={e=>{if(e.key==='Escape')onClose()}}>
  <video ref={video} className="intro-film" src="/media/garage-intro.mp4" poster="/media/cars/lambo.webp" preload="none" playsInline muted={muted} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={onClose} onError={()=>setError('The film could not load. You can still open your desk.')} aria-label="Lamborghini entry and closed-circuit racing film"/>
  <button autoFocus className="intro-skip" onClick={onClose}>Open my desk <X size={16}/></button>
  {!started&&<div className="cinema-welcome"><span className="eyebrow">DEREK’S PERFORMANCE GARAGE</span><h1>Take your seat.</h1><p>The next move is yours.</p><button className="primary" onClick={play}><Play size={18}/> Start the film</button><small>12 seconds · Lamborghini Huracán</small></div>}
  <div className="cinema-controls">{started&&<button onClick={()=>playing?video.current?.pause():play()} aria-label={playing?'Pause film':'Play film'}>{playing?<Pause size={18}/>:<Play size={18}/>}</button>}<button onClick={()=>setMuted(m=>!m)} aria-label={muted?'Turn engine sound on':'Mute engine sound'}>{muted?<VolumeX size={18}/>:<Volume2 size={18}/>}<span>{muted?'Sound off':'Engine sound on'}</span></button><span className="film-credit">HIGGSFIELD ORIGINAL · 01</span></div>
  {error&&<p className="cinema-error" role="alert">{error}</p>}
 </div>
}

export function FinishFilm(){
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const [failed,setFailed]=useState(false);
 return <div className="finish-film">{failed?<img src="/media/cars/rs6.webp" alt="Emerald Audi RS 6 Avant"/>:<video src="/media/finish-line.mp4" poster="/media/finish-poster.webp" autoPlay={!reduced} muted playsInline controls preload="metadata" onError={()=>setFailed(true)} aria-label="Audi RS 6 crossing the finish line"/>}</div>
}
