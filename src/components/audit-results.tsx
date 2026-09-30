import type { UniversalAudit } from "../domain/universal-audit";
import type { NicheAudit } from "../domain/niche-questions";

export function AuditResults({ audit, niche }: { audit: UniversalAudit; niche: NicheAudit }) {
  return (
    <section className="audit-results" aria-labelledby="audit-heading">
      <div className="audit-heading">
        <div>
          <p className="eyebrow">Captured-copy audit</p>
          <h2 id="audit-heading">Universal copy audit</h2>
          <p>
            Jev evaluated the immutable captured copy and your stated page intent. These are
            text-only judgments; no visual hierarchy or live-page behavior was assessed.
          </p>
        </div>
        <dl className="audit-summary">
          <div>
            <dt>Overall score</dt>
            <dd>{audit.overallScore} / 100</dd>
          </div>
          <div>
            <dt>Verdict</dt>
            <dd>{audit.verdict}</dd>
          </div>
        </dl>
      </div>

      <ol className="audit-results-list">
        {audit.results.map((result) => (
          <li className="audit-dimension" key={result.id}>
            <div>
              <p className="eyebrow">{result.dimension}</p>
              <p className="audit-question">{result.question}</p>
            </div>
            <p className="dimension-score">
              <strong>{result.displayScore}</strong>
              <span>/ 100</span>
            </p>
          </li>
        ))}
      </ol>

      <section className="niche-results" aria-labelledby="niche-heading">
        <div>
          <p className="eyebrow">Informative context only</p>
          <h3 id="niche-heading">Generated niche questions</h3>
          <p>
            Inferred niche: <strong>{niche.label}</strong>. These yes probabilities are not
            universal scores and do not change the overall score or verdict.
          </p>
        </div>
        <ol className="niche-results-list">
          {niche.results.map((result) => (
            <li className="niche-result" key={result.id}>
              <p className="niche-question">{result.question}</p>
              <p className="niche-probability">{Math.round(result.yesProbability * 100)}% yes probability</p>
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}
