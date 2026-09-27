import { CaptureForm } from "../src/components/capture-form";

export default function Home() {
  return (
    <main className="shell">
      <section className="intro">
        <p className="eyebrow">Controlled landing-page copy audit</p>
        <h1>Capture one page before judging its copy.</h1>
        <p>
          Start with the page as visitors see it and the intent you want it to serve. This step
          makes a static local preview; it never changes the live page.
        </p>
      </section>
      <CaptureForm />
    </main>
  );
}
