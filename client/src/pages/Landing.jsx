import { Link } from 'react-router-dom'
import { Brand, SiteFooter } from '../components/Brand'

// What a signed-out visitor sees at the site's address: what the platform
// is, and the two ways in.
const FEATURES = [
  { kicker: 'Video calls', title: 'Lessons on a shared board', text: 'Video, a whiteboard and a document everyone edits, background blur and noise removal — up to 6 people.' },
  { kicker: 'Grammar', title: 'Practice that checks itself', text: '34 chapters of exercises; the AI accepts every correct variant and explains a mistake in Russian.' },
  { kicker: 'Vocabulary', title: 'Words that stay', text: 'A dictionary with sound, your own words from the board, flashcards with spaced repetition.' },
  { kicker: 'Speaking', title: 'A chatbot to talk to', text: 'Speak English out loud and get corrected — any time, without being shy.' }
]

export default function Landing() {
  return (
    <div className="landing">
      <header className="landing-head"><Brand /></header>
      <main>
        <section className="landing-hero">
          <h1>English practice and lessons in one place</h1>
          <p className="muted">Start free: grammar, vocabulary and the speaking chatbot. Open more with a plan from 4.90 € a month — or study with a teacher.</p>
          <div className="landing-actions">
            <Link className="button big" to="/signup">Create an account</Link>
            <Link className="button big ghost" to="/login">Sign in</Link>
          </div>
        </section>
        <section className="tiles-grid landing-features">
          {FEATURES.map((f) => (
            <div key={f.kicker} className="tile">
              <span className="tile-kicker">{f.kicker}</span>
              <strong>{f.title}</strong>
              <span className="muted">{f.text}</span>
            </div>
          ))}
        </section>
        <section className="landing-plans">
          <h2>Plans</h2>
          <div className="landing-plan-row"><strong>Free</strong><span className="muted">10 grammar chapters, 20 AI checks a day, dictionary, flashcards, chatbot trial</span><span>0 €</span></div>
          <div className="landing-plan-row"><strong>Practice</strong><span className="muted">All grammar, unlimited AI, every word set, the chatbot in full</span><span>4.90 € / month</span></div>
          <div className="landing-plan-row"><strong>Calls</strong><span className="muted">Your own video calls with the board, no time limit; guests join free</span><span>5.90 € / month</span></div>
          <div className="landing-plan-row"><strong>Everything</strong><span className="muted">Practice and Calls together</span><span>8.90 € / month</span></div>
          <p className="muted">Yearly plans are about 30% cheaper. Students with a teacher get everything included.</p>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
