import { Component } from 'react';
import { useNavigate } from 'react-router-dom';
import { makeAuthenticatedRequest } from '../utils/Auth';

type Category = 'all' | 'living-room' | 'bedroom' | 'office-room' | 'kitchen' | 'widgets';

const CATEGORY_LABELS: Record<Category, string> = {
  all: 'All',
  'living-room': 'Living Room',
  bedroom: 'Bedroom',
  'office-room': 'Office Room',
  kitchen: 'Kitchen',
  widgets: 'Widgets',
};

const BACKEND_CATEGORY_MAP: Record<string, Category> = {
  'Living Room': 'living-room',
  Bedroom: 'bedroom',
  'Office Room': 'office-room',
  Kitchen: 'kitchen',
  Widgets: 'widgets',
  widget: 'widgets',
  'living-room': 'living-room',
  bedroom: 'bedroom',
  'office-room': 'office-room',
  kitchen: 'kitchen',
  widgets: 'widgets',
};

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  complete:            { bg: 'rgba(34,197,94,0.12)',  color: '#16a34a', label: 'Purchased' },
  'payment completed': { bg: 'rgba(59,130,246,0.12)', color: '#2563eb', label: 'Paid' },
  pending:             { bg: 'rgba(234,179,8,0.12)',  color: '#ca8a04', label: 'Pending' },
  cancelled:           { bg: 'rgba(239,68,68,0.12)',  color: '#dc2626', label: 'Cancelled' },
};

interface PaymentMethod {
  type: string;
  credit_card_last4: string | null;
  bank_account_last4: string | null;
}

interface OrderInfo {
  orderId: number;
  orderTotal: string;
  purchasedAt: string;
  orderStatus: string;
  quantity: number;
  paymentMethod: PaymentMethod | null;
}

interface LibraryItem {
  id: string;
  name: string;
  description: string;
  image: string | null;
  category: string;
  itemType: string;
  is_container: boolean;
  wall_mountable: boolean;
  orderInfo: OrderInfo | null; // null = custom-imported item
}

type ItemSource = 'all' | 'purchased' | 'custom';

interface LibraryState {
  items: LibraryItem[];
  loading: boolean;
  error: string | null;
  selectedCategory: Category;
  selectedSource: ItemSource;
  selectedItem: LibraryItem | null;
  searchQuery: string;
}

function getCategoryKey(raw: string): Category {
  return BACKEND_CATEGORY_MAP[raw] ?? 'all';
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatPrice(price: string): string {
  const num = parseFloat(price);
  if (isNaN(num)) return price;
  return `฿${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toDataUrl(image: string | null): string | null {
  if (!image) return null;
  if (image.startsWith('data:')) return image;
  return `data:image/png;base64,${image}`;
}

class ProductLibraryLogic {
  private state: LibraryState;
  private setState: (u: Partial<LibraryState>) => void;
  private navigate: (path: string) => void;

  constructor(setState: (u: Partial<LibraryState>) => void, navigate: (path: string) => void) {
    this.setState = setState;
    this.navigate = navigate;
    this.state = {
      items: [],
      loading: true,
      error: null,
      selectedCategory: 'all',
      selectedSource: 'all',
      selectedItem: null,
      searchQuery: '',
    };
  }

  updateState(u: Partial<LibraryState>): void {
    this.state = { ...this.state, ...u };
    this.setState(u);
  }

  async initialize(): Promise<void> {
    await this.loadItems();
  }

  async loadItems(): Promise<void> {
    this.updateState({ loading: true, error: null });
    try {
      const [catalogRes, ordersRes] = await Promise.all([
        makeAuthenticatedRequest('/digitalhomes/list_available_items/'),
        makeAuthenticatedRequest('/orders/list/'),
      ]);

      if (!catalogRes.ok) {
        const err = await catalogRes.json();
        throw new Error(err.error ?? 'Failed to load items');
      }

      const catalogData = await catalogRes.json();

      const orderByName = new Map<string, OrderInfo>();
      if (ordersRes.ok) {
        const ordersData = await ordersRes.json();
        const orders: any[] = [...(ordersData.orders ?? [])].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        for (const order of orders) {
          for (const oi of order.order_items ?? []) {
            const key = (oi.product_name ?? '').toLowerCase().trim();
            if (key && !orderByName.has(key)) {
              orderByName.set(key, {
                orderId: order.order_id,
                orderTotal: order.total_price,
                purchasedAt: order.created_at,
                orderStatus: order.status,
                quantity: oi.quantity ?? 1,
                paymentMethod: order.payment_method ?? null,
              });
            }
          }
        }
      }

      const items: LibraryItem[] = (catalogData.available_items ?? []).map((item: any) => {
        const nameKey = (item.name ?? '').toLowerCase().trim();
        const orderInfo = orderByName.get(nameKey) ?? null;
        return {
          id: item.id.toString(),
          name: item.name ?? '',
          description: item.description ?? '',
          image: item.image ?? null,
          category: item.category ?? '',
          itemType: item.type ?? '',
          is_container: item.is_container ?? false,
          wall_mountable: item.wall_mountable ?? false,
          orderInfo,
        };
      });

      this.updateState({ items, loading: false });
    } catch (error) {
      this.updateState({
        error: error instanceof Error ? error.message : 'Failed to load library',
        loading: false,
      });
    }
  }

  getFilteredItems(): LibraryItem[] {
    const { items, selectedCategory, selectedSource, searchQuery } = this.state;
    return items.filter((item) => {
      const matchCategory =
        selectedCategory === 'all' || getCategoryKey(item.category) === selectedCategory;
      const isCustom = item.orderInfo === null;
      const matchSource =
        selectedSource === 'all' ||
        (selectedSource === 'custom' && isCustom) ||
        (selectedSource === 'purchased' && !isCustom);
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        q === '' ||
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.itemType.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q);
      return matchCategory && matchSource && matchSearch;
    });
  }

  getPurchasedCount(): number {
    return this.state.items.filter((i) => i.orderInfo !== null).length;
  }

  getCustomCount(): number {
    return this.state.items.filter((i) => i.orderInfo === null).length;
  }

  getTotalCount(): number {
    return this.state.items.length;
  }

  goHome(): void {
    this.navigate('/');
  }
}

interface LibraryClassProps {
  navigate: (path: string) => void;
}

class ProductLibraryClass extends Component<LibraryClassProps, LibraryState> {
  private logic: ProductLibraryLogic;

  constructor(props: LibraryClassProps) {
    super(props);
    this.state = {
      items: [],
      loading: true,
      error: null,
      selectedCategory: 'all',
      selectedSource: 'all',
      selectedItem: null,
      searchQuery: '',
    };
    this.logic = new ProductLibraryLogic(
      (u) => this.setState(u as any),
      props.navigate,
    );
  }

  async componentDidMount(): Promise<void> {
    await this.logic.initialize();
  }

  render() {
    const { loading, error, selectedCategory, selectedSource, selectedItem, searchQuery } = this.state;
    const filtered = this.logic.getFilteredItems();
    const categories: Category[] = ['all', 'living-room', 'bedroom', 'office-room', 'kitchen', 'widgets'];
    const sources: { key: ItemSource; label: string; count: number }[] = [
      { key: 'all', label: 'All', count: this.logic.getTotalCount() },
      { key: 'purchased', label: 'Purchased item', count: this.logic.getPurchasedCount() },
      { key: 'custom', label: 'Custom imported item', count: this.logic.getCustomCount() },
    ];

    return (
      <div style={styles.page}>
        {/* Header */}
        <header style={styles.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button
              style={styles.backBtn}
              onClick={() => this.logic.goHome()}
              onMouseOver={(e) => (e.currentTarget.style.background = '#f1f5f9')}
              onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              ← Back
            </button>
            <div>
              <h1 style={styles.title}>Product Library</h1>
              <p style={styles.subtitle}>Your purchased & custom items</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={styles.badge}>
              {this.logic.getTotalCount()} {this.logic.getTotalCount() === 1 ? 'item' : 'items'}
            </span>
            <button
              style={{ ...styles.outlineBtn, opacity: loading ? 0.5 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
              disabled={loading}
              onClick={() => this.logic.loadItems()}
              onMouseOver={(e) => !loading && (e.currentTarget.style.background = '#f1f5f9')}
              onMouseOut={(e) => !loading && (e.currentTarget.style.background = 'transparent')}
            >
              ↻ Refresh
            </button>
          </div>
        </header>

        {/* Filters */}
        <div style={styles.filters}>
          <input
            type="text"
            placeholder="Search by name, type, or category..."
            value={searchQuery}
            onChange={(e) => this.logic.updateState({ searchQuery: e.target.value })}
            style={styles.searchInput}
          />
          <div style={styles.categoryRow}>
            {sources.map((src) => (
              <button
                key={src.key}
                onClick={() => this.logic.updateState({ selectedSource: src.key })}
                style={{ ...styles.catBtn, ...(selectedSource === src.key ? srcBtnActive(src.key) : {}) }}
              >
                {src.label}
                <span style={{ marginLeft: '0.35rem', opacity: 0.7, fontSize: '0.7rem' }}>({src.count})</span>
              </button>
            ))}
          </div>
          <div style={styles.categoryRow}>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => this.logic.updateState({ selectedCategory: cat })}
                style={{ ...styles.catBtn, ...(selectedCategory === cat ? styles.catBtnActive : {}) }}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <main style={styles.main}>
          {loading && (
            <div style={styles.centered}>
              <div style={styles.spinner} />
              <p style={{ color: '#64748b', marginTop: '1rem' }}>Loading your library...</p>
            </div>
          )}

          {error && !loading && (
            <div style={styles.errorBox}>
              <span><strong>Error:</strong> {error}</span>
              <button style={styles.retryBtn} onClick={() => this.logic.loadItems()}>Retry</button>
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div style={styles.centered}>
              <div style={{ fontSize: '3.5rem', marginBottom: '0.75rem' }}>📦</div>
              <h3 style={{ color: '#1e293b', marginBottom: '0.5rem' }}>No items found</h3>
              <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
                {this.logic.getTotalCount() === 0
                  ? 'Your library is empty. Purchase or import items to get started.'
                  : 'No items match the current filter.'}
              </p>
            </div>
          )}

          {!loading && !error && filtered.length > 0 && (
            <div style={styles.grid}>
              {filtered.map((item) => {
                const imgUrl = toDataUrl(item.image);
                const isCustom = item.orderInfo === null;
                const statusStyle = isCustom
                  ? { bg: 'rgba(139,92,246,0.12)', color: '#7c3aed', label: 'Custom' }
                  : (STATUS_STYLE[item.orderInfo!.orderStatus] ?? {
                      bg: 'rgba(100,116,139,0.12)', color: '#475569',
                      label: item.orderInfo!.orderStatus,
                    });

                return (
                  <div
                    key={item.id}
                    style={styles.card}
                    onClick={() => this.logic.updateState({ selectedItem: item })}
                    onMouseOver={(e) => {
                      e.currentTarget.style.transform = 'translateY(-4px)';
                      e.currentTarget.style.boxShadow = '0 10px 28px rgba(0,0,0,0.13)';
                      e.currentTarget.style.borderColor = '#3b82f6';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
                      e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)';
                    }}
                  >
                    {/* Image */}
                    <div style={styles.imgWrap}>
                      {imgUrl ? (
                        <img
                          src={imgUrl}
                          alt={item.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <div style={styles.imgPlaceholder}>🪑</div>
                      )}
                      {/* Status / Custom badge */}
                      <span style={{ ...styles.topBadge, background: statusStyle.bg, color: statusStyle.color }}>
                        {statusStyle.label}
                      </span>
                      {/* Quantity badge for purchased items */}
                      {!isCustom && item.orderInfo!.quantity > 1 && (
                        <span style={styles.qtyBadge}>×{item.orderInfo!.quantity}</span>
                      )}
                    </div>

                    <div style={styles.cardBody}>
                      <h3 style={styles.cardName}>{item.name}</h3>

                      {item.description && (
                        <p style={styles.cardDesc}>{item.description}</p>
                      )}

                      {isCustom ? (
                        <p style={styles.customLabel}>Custom imported item</p>
                      ) : (
                        <>
                          <p style={styles.purchasedLabel}>Purchased item</p>
                          <div style={styles.metaRow}>
                            <span style={styles.price}>{formatPrice(item.orderInfo!.orderTotal)}</span>
                            <span style={styles.date}>{formatDate(item.orderInfo!.purchasedAt)}</span>
                          </div>
                        </>
                      )}

                      <div style={styles.tagRow}>
                        {item.category && (
                          <span style={{ ...styles.tag, background: 'rgba(139,92,246,0.1)', color: '#7c3aed' }}>
                            {item.category}
                          </span>
                        )}
                        {item.itemType && (
                          <span style={{ ...styles.tag, background: 'rgba(59,130,246,0.1)', color: '#2563eb' }}>
                            {item.itemType}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>

        {selectedItem && <ItemModal
          item={selectedItem}
          onClose={() => this.logic.updateState({ selectedItem: null })}
        />}

        <style>{`
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }
}

function ItemModal({ item, onClose }: { item: LibraryItem; onClose: () => void }) {
  const imgUrl = toDataUrl(item.image);
  const isCustom = item.orderInfo === null;
  const statusStyle = isCustom
    ? { bg: 'rgba(139,92,246,0.12)', color: '#7c3aed', label: 'Custom' }
    : (STATUS_STYLE[item.orderInfo!.orderStatus] ?? {
        bg: 'rgba(100,116,139,0.12)', color: '#475569',
        label: item.orderInfo!.orderStatus,
      });
  const paymentLabel = !isCustom && item.orderInfo!.paymentMethod
    ? item.orderInfo!.paymentMethod.type === 'credit_card'
      ? `Credit Card ····${item.orderInfo!.paymentMethod.credit_card_last4 ?? ''}`
      : `Bank Account ····${item.orderInfo!.paymentMethod.bank_account_last4 ?? ''}`
    : null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button
          style={styles.modalClose}
          onClick={onClose}
          onMouseOver={(e) => (e.currentTarget.style.background = '#f1f5f9')}
          onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          ✕
        </button>

        {/* Image */}
        <div style={styles.modalImgWrap}>
          {imgUrl ? (
            <img src={imgUrl} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '4rem' }}>🪑</div>
          )}
        </div>

        <div style={styles.modalBody}>
          {/* Title + badge */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <h2 style={styles.modalTitle}>{item.name}</h2>
            <span style={{ ...styles.topBadge, position: 'static', padding: '0.3rem 0.7rem', fontSize: '0.8rem', background: statusStyle.bg, color: statusStyle.color, flexShrink: 0, borderRadius: '999px' }}>
              {statusStyle.label}
            </span>
          </div>

          <p style={item.description ? styles.modalDesc : { ...styles.modalDesc, color: '#94a3b8', fontStyle: 'italic' }}>
            {item.description || 'No description available.'}
          </p>

          {!isCustom && (
            <div style={styles.highlightRow}>
              <div style={styles.highlightCard}>
                <span style={styles.highlightLabel}>Order Total</span>
                <span style={styles.highlightValue}>{formatPrice(item.orderInfo!.orderTotal)}</span>
              </div>
              <div style={styles.highlightCard}>
                <span style={styles.highlightLabel}>Quantity</span>
                <span style={styles.highlightValue}>×{item.orderInfo!.quantity}</span>
              </div>
              <div style={styles.highlightCard}>
                <span style={styles.highlightLabel}>Purchased</span>
                <span style={{ ...styles.highlightValue, fontSize: '0.75rem' }}>{formatDate(item.orderInfo!.purchasedAt)}</span>
              </div>
            </div>
          )}

          {/* Detail table */}
          <div style={styles.detailTable}>
            <DetailRow label="Category"      value={item.category  || '—'} />
            <DetailRow label="Type"          value={item.itemType  || '—'} />
            <DetailRow label="Container"     value={item.is_container  ? 'Yes' : 'No'} />
            <DetailRow label="Wall Mountable" value={item.wall_mountable ? 'Yes' : 'No'} />
            {!isCustom && <DetailRow label="Payment"  value={paymentLabel ?? '—'} />}
            {!isCustom && <DetailRow label="Order ID" value={`#${item.orderInfo!.orderId}`} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.detailRow}>
      <span style={styles.detailLabel}>{label}</span>
      <span style={styles.detailValue}>{value}</span>
    </div>
  );
}

const srcBtnActive = (key: ItemSource): React.CSSProperties => {
  if (key === 'purchased') return { background: '#3b82f6', borderColor: '#3b82f6', color: '#fff' };
  if (key === 'custom') return { background: '#7c3aed', borderColor: '#7c3aed', color: '#fff' };
  return { background: '#475569', borderColor: '#475569', color: '#fff' };
};

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', backgroundColor: '#e7e9eb', color: '#1e293b', fontFamily: 'system-ui, -apple-system, sans-serif' },
  header: { padding: '1.25rem 2rem', background: 'white', borderBottom: '1px solid rgba(0,0,0,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: '1.4rem', fontWeight: 700, margin: 0, color: '#1e293b' },
  subtitle: { fontSize: '0.8rem', color: '#64748b', margin: '0.15rem 0 0 0' },
  backBtn: { padding: '0.4rem 0.75rem', background: 'transparent', border: '1px solid rgba(0,0,0,0.15)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem', color: '#475569' },
  outlineBtn: { padding: '0.4rem 0.75rem', background: 'transparent', border: '1px solid rgba(0,0,0,0.15)', borderRadius: '6px', fontSize: '0.875rem', color: '#475569' },
  badge: { padding: '0.25rem 0.75rem', background: 'rgba(59,130,246,0.1)', borderRadius: '999px', fontSize: '0.8rem', color: '#3b82f6', fontWeight: 500 },
  filters: { padding: '0.875rem 2rem', background: 'white', borderBottom: '1px solid rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.65rem' },
  searchInput: { padding: '0.5rem 0.875rem', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.15)', background: '#f8fafc', color: '#1e293b', fontSize: '0.875rem', outline: 'none', maxWidth: '400px', width: '100%' },
  categoryRow: { display: 'flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'center' },
  catBtn: { padding: '0.3rem 0.8rem', border: '1px solid rgba(0,0,0,0.12)', borderRadius: '999px', background: 'transparent', color: '#475569', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 500 },
  catBtnActive: { background: '#3b82f6', borderColor: '#3b82f6', color: '#fff' },
  main: { padding: '2rem', maxWidth: '1400px', margin: '0 auto' },
  centered: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '380px', textAlign: 'center' },
  spinner: { width: '48px', height: '48px', border: '4px solid rgba(59,130,246,0.2)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  errorBox: { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '10px', padding: '1rem 1.25rem', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '1rem' },
  retryBtn: { marginLeft: 'auto', padding: '0.4rem 0.875rem', background: '#ef4444', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontSize: '0.875rem' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1.25rem' },
  card: { background: 'white', borderRadius: '14px', border: '1px solid rgba(0,0,0,0.08)', cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s, border-color 0.2s', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' },
  imgWrap: { position: 'relative', width: '100%', height: '170px', background: '#f1f5f9', overflow: 'hidden' },
  imgPlaceholder: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '2.5rem' },
  topBadge: { position: 'absolute', top: '0.5rem', left: '0.5rem', padding: '0.2rem 0.55rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600 },
  qtyBadge: { position: 'absolute', top: '0.5rem', right: '0.5rem', padding: '0.2rem 0.5rem', borderRadius: '999px', background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: '0.72rem', fontWeight: 600 },
  cardBody: { padding: '0.875rem 1rem 1rem' },
  cardName: { fontSize: '0.975rem', fontWeight: 600, margin: '0 0 0.35rem 0', color: '#1e293b' },
  cardDesc: { fontSize: '0.78rem', color: '#64748b', margin: '0 0 0.6rem 0', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
  metaRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.6rem', gap: '0.5rem' },
  price: { fontSize: '1rem', fontWeight: 700, color: '#1e293b' },
  date: { fontSize: '0.72rem', color: '#94a3b8', textAlign: 'right' as const },
  customLabel: { fontSize: '0.75rem', color: '#7c3aed', margin: '0 0 0.6rem 0', fontStyle: 'italic' },
  purchasedLabel: { fontSize: '0.75rem', color: '#2563eb', margin: '0 0 0.35rem 0', fontStyle: 'italic' },
  tagRow: { display: 'flex', flexWrap: 'wrap', gap: '0.35rem' },
  tag: { padding: '0.18rem 0.5rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 500 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modal: { background: 'white', borderRadius: '18px', maxWidth: '500px', width: '100%', maxHeight: '90vh', overflowY: 'auto', position: 'relative', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' },
  modalClose: { position: 'absolute', top: '0.75rem', right: '0.75rem', width: '30px', height: '30px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '6px', background: 'transparent', cursor: 'pointer', fontSize: '0.85rem', color: '#475569', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modalImgWrap: { width: '100%', height: '220px', background: '#f1f5f9', borderRadius: '18px 18px 0 0', overflow: 'hidden' },
  modalBody: { padding: '1.25rem 1.5rem 1.5rem' },
  modalTitle: { fontSize: '1.3rem', fontWeight: 700, margin: 0, color: '#1e293b' },
  modalDesc: { fontSize: '0.875rem', color: '#475569', lineHeight: 1.6, margin: '0.75rem 0 1.25rem' },
  highlightRow: { display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' },
  highlightCard: { flex: 1, background: '#f8fafc', border: '1px solid rgba(0,0,0,0.07)', borderRadius: '10px', padding: '0.625rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' },
  highlightLabel: { fontSize: '0.7rem', color: '#94a3b8', fontWeight: 500, textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  highlightValue: { fontSize: '1rem', fontWeight: 700, color: '#1e293b' },
  detailTable: { border: '1px solid rgba(0,0,0,0.08)', borderRadius: '10px', overflow: 'hidden' },
  detailRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 1rem', borderBottom: '1px solid rgba(0,0,0,0.06)', fontSize: '0.85rem' },
  detailLabel: { color: '#64748b', fontWeight: 500 },
  detailValue: { color: '#1e293b', fontWeight: 500 },
};

export function ProductLibrary() {
  const navigate = useNavigate();
  return <ProductLibraryClass navigate={navigate} />;
}
