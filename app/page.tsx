import Link from "next/link";

const productPrinciple =
  "Keep revenue data trustworthy by pairing transparent agent recommendations with human approval and auditable evidence.";

export default function Home() {
  return (
    <main className="home-shell">
      <section aria-labelledby="product-name" className="hero-card">
        <p className="eyebrow">Stage 12 core UI</p>
        <h1 id="product-name">CRM Hygiene Agent</h1>
        <p className="principle">{productPrinciple}</p>
        <div className="hero-actions">
          <Link className="button-link" href="/dashboard">Open dashboard</Link>
          <Link className="button-link secondary" href="/approvals">Review approvals</Link>
        </div>
      </section>
    </main>
  );
}
