// Get Reflex URL from environment or use default
const REFLEX_URL = import.meta.env.VITE_REFLEX_URL || 'http://localhost:3000'

export function Overlay({ hoveredDevice }) {
  const handleNavigation = (path) => {
    window.location.href = `${REFLEX_URL}${path}`
  }

  return (
    <div className="overlay">
      {/* Header */}
      <header className="header">
        <div className="logo">SmartHomeAR</div>
        <nav className="nav">
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#about">About</a>
        </nav>
        <div className="cta-buttons">
          <button className="btn btn-secondary" onClick={() => handleNavigation('/login')}>
            Sign In
          </button>
          <button className="btn btn-primary" onClick={() => handleNavigation('/signup')}>
            Get Started
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <div className="hero">
        <h1>Control Your Home with AR</h1>
        <p>Experience the future of smart home management with augmented reality visualization and intelligent automation.</p>
        <button className="btn btn-primary" onClick={() => handleNavigation('/signup')}>
          Start Free Trial
        </button>
      </div>

      {/* Device Info (shows when hovering) */}
      {hoveredDevice && (
        <div className="device-info">
          <h3>{hoveredDevice.name}</h3>
          <div className="device-type">{hoveredDevice.type}</div>
          <ul className="features">
            {hoveredDevice.features.map((feature, index) => (
              <li key={index}>✓ {feature}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Features Grid */}
      {!hoveredDevice && (
        <div className="features-grid">
          <div className="feature-card">
            <h4>🎯 AR View</h4>
            <p>Visualize devices in 3D space</p>
          </div>
          <div className="feature-card">
            <h4>⚡ Quick Control</h4>
            <p>Control all devices instantly</p>
          </div>
          <div className="feature-card">
            <h4>📊 Analytics</h4>
            <p>Monitor energy usage</p>
          </div>
          <div className="feature-card">
            <h4>🎤 Voice Control</h4>
            <p>Hands-free operation</p>
          </div>
        </div>
      )}
    </div>
  )
}

