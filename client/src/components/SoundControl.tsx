import {useState} from 'react';
import {playTone} from '../sound.js';
export default function SoundControl(){const [muted,setMuted]=useState(()=>localStorage.getItem('rushout-muted')!=='false');return <button className="sound-toggle" aria-pressed={!muted} aria-label={muted?'Enable sound':'Mute sound'} onClick={()=>{localStorage.setItem('rushout-muted',String(!muted));setMuted(!muted);if(muted)playTone('start');}}>Sound {muted?'OFF':'ON'}</button>;}
