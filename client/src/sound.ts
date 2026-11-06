let audio: AudioContext | undefined;
export function playTone(kind:'tag'|'start'|'end') {
 if(localStorage.getItem('rushout-muted')!=='false')return;
 try {audio??=new AudioContext();void audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.connect(g);g.connect(audio.destination);o.type='triangle';o.frequency.setValueAtTime(kind==='tag'?640:kind==='start'?440:220,audio.currentTime);o.frequency.exponentialRampToValueAtTime(kind==='end'?110:880,audio.currentTime+.15);g.gain.setValueAtTime(.06,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.2);o.start();o.stop(audio.currentTime+.21);}catch{/* Sound is optional when audio is unavailable. */}
}
