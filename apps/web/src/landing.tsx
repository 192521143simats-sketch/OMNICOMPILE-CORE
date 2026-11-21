import 'react';
import './landing.css';
// Cinematic Minimalist Landing Page Redesign
export function Home(){
  return (
    <div className="cinematic-landing">
      {/* Background Cinematic Lighting & Orbital Geometry */}
      <div className="bg-glow-layer" aria-hidden="true" /><div className="cinematic-streak" aria-hidden="true" />
      <div aria-hidden="true" className="orbital-circle circle-1" />
      <div aria-hidden="true" className="orbital-circle circle-2" />
      <div aria-hidden="true" className="orbital-circle circle-3" />

      {/* Top Header Logo */}
      <a className="skip-link" href="#main-content">Skip to content</a><header className="cinematic-header">
        <a href="/" className="brand"><span>OC</span> OmniCompile Core</a>
      </header>

      {/* Main Cinematic Hero */}
      <main id="main-content" tabIndex={-1} className="cinematic-hero">
        <div className="hero-inner">
          <p className="eyebrow-cinematic">&gt; ZERO-TRUST DISTRIBUTED COMPILATION</p>
          <h1 className="hero-headline"><span>Compile Without</span><span>Limits.</span></h1>
          <p className="hero-subtitle">Intelligent compilation. Distributed execution. Secure optimization.</p>
          <p className="hero-description">
            A unified compilation platform that connects distributed computing nodes to compile, optimize, and execute code across heterogeneous environments.
          </p>

          <div className="cta-container">
            <a href="/login" className="btn-get-started">
              GET STARTED <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>

        {/* Thin Horizontal Divider with Animated Highlight */}
        <div className="cinematic-divider-wrap">
          <div className="side-label left">
            <span className="label-title">&gt; DISTRIBUTED COMPUTING</span>
            <span className="label-sub">Cross-platform execution</span>
          </div>
          <div className="divider-line">
            <div className="divider-glow" />
          </div>
          <div className="side-label right">
            <span className="label-title">&gt; INTELLIGENT OPTIMIZATION</span>
            <span className="label-sub">Multi-language compilation</span>
          </div>
        </div>
      </main>

      {/* Bottom Infrastructure Notice */}
      <footer className="cinematic-footer">
        <div className="landing-signature"><strong>OMNICOMPILE CORE</strong><span>Distributed Compiler Infrastructure</span></div>
      </footer>
    </div>
  );
}
