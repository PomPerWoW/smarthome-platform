import { Component } from 'react';
import { getUsername, logout, makeAuthenticatedRequest } from '../utils/Auth';
import { useNavigate } from 'react-router-dom';

const REFLEX_APP_URL = import.meta.env.VITE_DIGITAL_HOME_PLATFORM_URL;

interface DigitalHome {
  id: number;
  name: string;
  home_id: number;
  deployedItems: Array<{ id: string; is_container: boolean }>;
  spatialData: {
    id: number;
    positions: any;
    rotation: any;
    scale: any;
    boundary: any;
  };
  texture_id: number | null;
  created_at: string;
  updated_at: string;
}

interface HomeState {
  username: string | null;
  digitalHomes: DigitalHome[];
  loading: boolean;
  error: string | null;
}

interface HomeLogicCallbacks {
  navigate: (path: string) => void;
}
export class HomeLogic {
  private state: HomeState;
  private setState: (update: Partial<HomeState>) => void;
  private callbacks: HomeLogicCallbacks;

  constructor(
    setState: (update: Partial<HomeState>) => void,
    callbacks: HomeLogicCallbacks
  ) {
    this.setState = setState;
    this.callbacks = callbacks;
    
    this.state = {
      username: null,
      digitalHomes: [],
      loading: true,
      error: null,
    };
  }

  updateState(update: Partial<HomeState>): void {
    this.state = { ...this.state, ...update };
    this.setState(update);
  }

  async initialize(): Promise<void> {
    const username = getUsername();
    this.updateState({ username });
    await this.loadDigitalHomes();
  }

  async loadDigitalHomes(): Promise<void> {
    this.updateState({ loading: true, error: null });

    try {
      const response = await makeAuthenticatedRequest('/digitalhomes/get_digital_homes/');

      if (response.ok) {
        const data = await response.json();
        this.updateState({
          digitalHomes: data.digital_homes || [],
          loading: false,
        });
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to load digital homes');
      }
    } catch (error) {
      console.error('❌ Failed to load digital homes:', error);
      this.updateState({
        error: error instanceof Error ? error.message : 'Failed to load digital homes',
        loading: false,
      });
    }
  }

  async handleLogout(): Promise<void> {
    console.log('👋 Logging out...');
    await logout();
    window.location.href = REFLEX_APP_URL;
  }

  handleEditScene(homeId: number): void {
    this.callbacks.navigate(`/scene/${homeId}`);
  }

  handleAddModel(): void {
    this.callbacks.navigate('/add-model');
  }

  handleProductLibrary(): void {
    this.callbacks.navigate('/product-library');
  }

  handleAvatarSelection(): void {
    this.callbacks.navigate('/avatar-selection');
  }

  formatDate(dateString: string): string {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  }

  getHomeCount(): number {
    return this.state.digitalHomes.length;
  }
}

interface HomeClassProps {
  navigate: (path: string) => void;
}

export class HomeClass extends Component<HomeClassProps, HomeState> {
  private logic: HomeLogic;

  constructor(props: HomeClassProps) {
    super(props);

    this.state = {
      username: null,
      digitalHomes: [],
      loading: true,
      error: null,
    };

    this.logic = new HomeLogic(
      (update) => this.setState(update as any),
      {
        navigate: props.navigate,
      }
    );
  }

  async componentDidMount(): Promise<void> {
    await this.logic.initialize();
  }

  render() {
    const { username, digitalHomes, loading, error } = this.state;

    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#e7e9eb',
        color: '#1e293b',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        margin: 0,
        padding: 0,
      }}>
        {/* Header */}
        <header style={{
          padding: '1.5rem 2rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'white',
          backdropFilter: 'blur(10px)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: '600', margin: 0 }}>
              My Digital Home
            </h1>
            <span style={{
              padding: '0.25rem 0.75rem',
              background: 'rgba(115, 165, 246, 0.21)',
              borderRadius: '999px',
              fontSize: '0.85rem',
              color: '#60a5fa',
            }}>
              {this.logic.getHomeCount()} {this.logic.getHomeCount() === 1 ? 'Home' : 'Homes'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ color: '#1e293b', fontSize: '0.95rem' }}>
              Welcome, <strong>{username}</strong>!
            </span>
            <button
              onClick={() => this.logic.handleLogout()}
              style={{
                padding: '0.5rem 1rem',
                background: '#ef4444',
                border: 'none',
                borderRadius: '6px',
                color: '#ffffff',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: '500',
                transition: 'background 0.2s',
              }}
              onMouseOver={(e) => e.currentTarget.style.background = '#dc2626'}
              onMouseOut={(e) => e.currentTarget.style.background = '#ef4444'}
            >
              Close
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '2rem',
          }}>
            <h2 style={{ fontSize: '1.75rem', margin: 0 }}>Homes</h2>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                onClick={() => this.logic.loadDigitalHomes()}
                disabled={loading}
                style={{
                  padding: '0.5rem 1rem',
                  background: loading ? '#4b5563' : '#3b82f6',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#ffffff',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
                onMouseOver={(e) => !loading && (e.currentTarget.style.background = '#2563eb')}
                onMouseOut={(e) => !loading && (e.currentTarget.style.background = '#3b82f6')}
              >
                {loading ? '⟳ Loading...' : '↻ Refresh'}
              </button>

              <button
                onClick={() => this.logic.handleProductLibrary()}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#8b5cf6',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontWeight: 500,
                  transition: 'background 0.2s',
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = '#7c3aed')}
                onMouseOut={(e) => (e.currentTarget.style.background = '#8b5cf6')}
              >
                📦 Product Library
              </button>

              <button
                onClick={() => this.logic.handleAvatarSelection()}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#6366f1',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontWeight: 500,
                  transition: 'background 0.2s',
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = '#4f46e5')}
                onMouseOut={(e) => (e.currentTarget.style.background = '#6366f1')}
              >
                🧍 My Avatar
              </button>

              <button
                onClick={() => this.logic.handleAddModel()}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#22c55e',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontWeight: 500,
                  transition: 'background 0.2s',
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = '#16a34a')}
                onMouseOut={(e) => (e.currentTarget.style.background = '#22c55e')}
              >
                ➕ Add Model
              </button>
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: '400px',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: '60px',
                  height: '60px',
                  border: '4px solid rgba(59, 130, 246, 0.3)',
                  borderTopColor: '#3b82f6',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  margin: '0 auto 1rem',
                }} />
                <p style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                  Loading your digital homes...
                </p>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '12px',
              padding: '1.5rem',
              marginBottom: '2rem',
            }}>
              <h3 style={{ color: '#f87171', marginBottom: '0.5rem' }}>
                ⚠️ Error Loading Homes
              </h3>
              <p style={{ color: 'rgba(255, 255, 255, 0.7)', margin: 0 }}>
                {error}
              </p>
            </div>
          )}

          {/* Digital Homes Grid */}
          {!loading && !error && digitalHomes.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '1.5rem',
            }}>
              {digitalHomes.map((home) => (
                <div
                  key={home.id}
                  style={{
                    background: 'white',
                    backdropFilter: 'blur(10px)',
                    padding: '0 1.5rem 1.5rem 1.5rem',
                    borderRadius: '16px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    transition: 'all 0.3s',
                    cursor: 'pointer',
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.5)';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.3)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div style={{ marginBottom: '1rem' }}>
                    <h3 style={{
                      fontSize: '1.25rem',
                      marginBottom: '0.5rem',
                      color: '#1e293b',
                    }}>
                      {home.name}
                    </h3>
                    <div style={{
                      display: 'flex',
                      gap: '0.5rem',
                      flexWrap: 'wrap',
                    }}>
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        background: 'rgba(34, 197, 94, 0.2)',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        color: '#4ade80',
                      }}>
                        ID: {home.id}
                      </span>
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        background: 'rgba(168, 85, 247, 0.2)',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        color: '#c084fc',
                      }}>
                        {home.deployedItems.length} Items
                      </span>
                    </div>
                  </div>

                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                    marginBottom: '1rem',
                    padding: '1rem',
                    background: '#e7e9eb',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#1e293b' }}>Created:</span>
                      <span style={{ color: '#64748b' }}>
                        {this.logic.formatDate(home.created_at)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#1e293b' }}>Updated:</span>
                      <span style={{ color: '#64748b' }}>
                        {this.logic.formatDate(home.updated_at)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#1e293b' }}>Home Model ID:</span>
                      <span style={{ color: '#64748b' }}>
                        {home.home_id}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        this.logic.handleEditScene(home.id);
                      }}
                      style={{
                        flex: 1,
                        padding: '0.75rem',
                        background: '#3b82f6',
                        border: 'none',
                        borderRadius: '8px',
                        color: '#ffffff',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        fontWeight: '500',
                        transition: 'background 0.2s',
                      }}
                      onMouseOver={(e) => e.currentTarget.style.background = '#2563eb'}
                      onMouseOut={(e) => e.currentTarget.style.background = '#3b82f6'}
                    >
                      ✏️ Edit Scene
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && digitalHomes.length === 0 && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '400px',
              textAlign: 'center',
            }}>
              <div style={{
                fontSize: '4rem',
                marginBottom: '1rem',
                opacity: 0.5,
              }}>
                🏠
              </div>
              <h3 style={{
                fontSize: '1.2rem',
                marginBottom: '0.75rem',
                color: '#1e293b',
              }}>
                No Digital Homes Yet
              </h3>
            </div>
          )}
        </main>

        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }
}

export function Home() {
  const navigate = useNavigate();
  return <HomeClass navigate={navigate} />;
}