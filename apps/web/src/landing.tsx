// Landing page redesign with system red/white/black palette and smooth motion designs
function Home(){
  return (
    <div className="landing-container">
      <header className="landing-header">
        <a href="/" className="brand"><span>OC</span> OmniCompile Core</a>
        <nav>
          <a href="/login" className="nav-link-login">Sign In</a>
          <a href="/signup" className="nav-link-signup">Get Started</a>
        </nav>
      </header>
      <main className="landing-hero">
        <div className="hero-content">
          <p className="hero-eyebrow">&gt; ZERO-TRUST DISTRIBUTED COMPILER PIPELINE</p>
          <h1>Hardware-Adaptive Distributed Compilation for Heterogeneous Edge-to-Cloud Orchestration</h1>
          <p className="hero-desc">
            OmniCompile Core seamlessly combines real C, Python, and Java compiler pipelines with intelligent, capability-aware scheduling across decentralized worker nodes and isolated cloud environments.
          </p>
          <div className="hero-actions">
            <a href="/signup" className="btn-primary-red">Get Started</a>
            <a href="/login" className="btn-secondary-outline">Sign In</a>
          </div>
        </div>
        <div className="hero-features">
          <div className="feature-card">
            <h3>Three Complete Pipelines</h3>
            <p>Independent processing and optimization for C, Python, and Java source code.</p>
          </div>
          <div className="feature-card">
            <h3>Zero-Trust Worker Network</h3>
            <p>Consent-based browser, Windows, and Android worker nodes securely enrolled via single admin links.</p>
          </div>
          <div className="feature-card">
            <h3>Smart Resource Scheduling</h3>
            <p>Automatically detects local capabilities and routes to local toolchains or isolated cloud toolchains.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
