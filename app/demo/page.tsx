export default function DemoLandingPage() {
  return (
    <main className="demo-page">
      <nav className="demo-nav" aria-label="Demo navigation">
        <a href="#pricing">Pricing</a>
        <a className="demo-nav-cta" href="#trial">
          Start free
        </a>
      </nav>
      <section className="demo-hero">
        <p className="demo-kicker">Release coordination for independent product teams</p>
        <h1>Ship the next release without the scramble.</h1>
        <p className="demo-lede">
          Relay gives product, engineering, and support one calm place to turn launch decisions
          into a shared plan.
        </p>
        <a className="demo-button" href="#trial">
          Start a free trial
        </a>
      </section>
      <section className="demo-proof" aria-label="What Relay helps teams do">
        <p>Keep decisions, launch status, and handoffs in one visible place.</p>
        <p>Give every team a clear owner before a release goes live.</p>
      </section>
      <section id="pricing" className="demo-pricing">
        <h2>Start with a 14-day team trial.</h2>
        <p>No credit card required to bring your next launch into Relay.</p>
      </section>
      <footer id="trial">A factual controlled demo page for local capture.</footer>
    </main>
  );
}
