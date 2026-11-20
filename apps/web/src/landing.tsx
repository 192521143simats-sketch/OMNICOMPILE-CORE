// Cinematic Minimalist Landing Page Redesign
function Home(){
  return (
    <div className="cinematic-landing">
      {/* Background Cinematic Lighting & Orbital Geometry */}
      <div className="bg-glow-layer" />
      <div className="orbital-circle circle-1" />
      <div className="orbital-circle circle-2" />
      <div className="orbital-circle circle-3" />

      {/* Top Header Logo */}
      <header className="cinematic-header">
        <a href="/" className="brand"><span>OC</span> OmniCompile Core</a>
      </header>

      {/* Main Cinematic Hero */}
      <main className="cinematic-hero">
        <div className="hero-inner">
          <p className="eyebrow-cinematic">&gt; ZERO-TRUST DISTRIBUTED COMPILATION</p>
          <h1 className="hero-headline">Compile Without Limits.</h1>
          <p className="hero-subtitle">Intelligent compilation. Distributed execution. Secure optimization.</p>
          <p className="hero-description">
            A unified compilation platform connecting distributed nodes to compile, optimize and execute code across heterogeneous environments.
          </p>

          <div className="cta-container">
            <a href="/login" className="btn-get-started">
              GET STARTED <span>→</span>
            </a>
          </div>
        </div>

        {/* Thin Horizontal Divider with Animated Highlight */}
        <div className="cinematic-divider-wrap">
          <div className="side-label left">
            <span className="label-title">DISTRIBUTED COMPUTING</span>
            <span className="label-sub">Cross-platform execution</span>
          </div>
          <div className="divider-line">
            <div className="divider-glow" />
          </div>
          <div className="side-label right">
            <span className="label-title">INTELLIGENT OPTIMIZATION</span>
            <span className="label-sub">Multi-language compilation</span>
          </div>
        </div>
      </main>

      {/* Bottom Infrastructure Notice */}
      <footer className="cinematic-footer">
        <p>OMNICOMPILE CORE &bull; Distributed compiler infrastructure built for Windows, Web, and Android workers.</p>
      </footer>
    </div>
  );
}
