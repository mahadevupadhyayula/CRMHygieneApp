const productPrinciple =
  "Keep revenue data trustworthy by pairing transparent agent recommendations with human approval and auditable evidence.";

export default function Home() {
  return (
    <main className="home-shell">
      <section aria-labelledby="product-name" className="hero-card">
        <p className="eyebrow">Stage 0 scaffold</p>
        <h1 id="product-name">CRM Hygiene Agent</h1>
        <p className="principle">{productPrinciple}</p>
      </section>
    </main>
  );
}
