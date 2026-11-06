import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button.js';
export default function MainMenu() {
 return <main className="arcade-bg"><div className="home-shell">
 <header className="brand-bar"><span>RUSHOUT / THE CHASE IS ON</span><a href="https://github.com/SinghAman21/rushout">Source ↗</a></header>
 <section className="home-hero"><div><span className="eyebrow">SMALL CHARACTERS. BIG PANIC.</span><h1 className="wordmark">RUSH<span>OUT</span><i>!</i></h1><p className="hero-copy">Run. Jump. Pass the pressure.</p><p className="muted">A playground, your friends, and one very hot tag.<br/>When the clock hits zero, don’t be IT.</p></div><div className="hero-art" aria-hidden="true"><div className="art-orbit"/><div className="mascot mascot-yellow"><b>IT!</b><span>••</span></div><div className="mascot mascot-blue"><span>••</span></div><div className="art-platform"/><span className="art-caption">CATCH ME IF YOU CAN ↗</span></div></section>
 <section className="mode-grid" aria-label="Choose how to play">{[
 {to:'/practice',n:'01',title:'Solo practice',copy:'Find your feet. Chase three bots offline.',cta:'Practice with bots',color:'yellow'},
 {to:'/local',n:'02',title:'Couch crew',copy:'2–4 friends. One keyboard. Zero mercy.',cta:'Play local',color:'green'},
 {to:'/create-room',n:'03',title:'Party online',copy:'Bring up to 13 players into the chase.',cta:'Create a room',color:'blue'}
 ].map(m=><article className="mode-panel" key={m.to}><span className="mode-number">{m.n}</span><h2>{m.title}</h2><p>{m.copy}</p><Button asChild className={`arcade-btn arcade-btn-${m.color}`}><Link to={m.to}>{m.cta} →</Link></Button></article>)}</section>
 <footer className="home-footer"><span>Already invited? <Link to="/join-room">Join with a room code →</Link></span><span>Free to play · Pickups activate on contact</span></footer>
 <details className="rules"><summary>New to the chase? Here’s the playbook</summary><p>Touch another runner to pass IT. Avoid holding the tag when time runs out. Jump between platforms and grab glowing pickups for automatic abilities. Local controls are shown before you start; online and solo use A/D + W or arrow keys.</p></details>
 </div></main>;
}
