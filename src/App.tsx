import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AcaiBuilderModal } from './components/AcaiBuilderModal';
import { AdminPanel } from './components/AdminPanel';
import { CartDrawer } from './components/CartDrawer';
import { CheckoutAndPixFlow } from './components/CheckoutAndPixFlow';
import { OrderTrackingView } from './components/OrderTrackingView';
import { ProductOptionsSheet } from './components/ProductOptionsSheet';
import { Storefront } from './components/Storefront';
import { BrandSplash } from './components/TropicalArtwork';
import {
  CartItem,
  Order,
  Product,
  StoreCatalogResponse,
} from './types';
import { apiRequest, isStandaloneMode, subscribeLocalSync } from './utils/api';
import { playCustomerUpdateSound, unlockAudioContext } from './utils/sound';

function mergeOrderHistory(incoming: Order[], existing: Order[]): Order[] {
  const byId = new Map<string, Order>();
  for (const o of existing) byId.set(o.id, o);
  for (const o of incoming) {
    const prev = byId.get(o.id);
    if (!prev || new Date(o.updatedAt).getTime() >= new Date(prev.updatedAt).getTime()) {
      byId.set(o.id, o);
    }
  }
  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

function getOrCreateCustomerToken(): string {
  let token = localStorage.getItem('tropicalia_device_token');
  if (!token || token.length < 16) {
    token =
      (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `dev_${Date.now()}_${Math.random().toString(36).slice(2)}`) +
      '_' +
      Math.random().toString(36).slice(2, 8);
    localStorage.setItem('tropicalia_device_token', token);
  }
  return token;
}

const STATUS_TOAST_MAP: Record<string, string> = {
  preparing: 'Seu pedido está em preparo!',
  ready: 'Seu pedido está pronto!',
  out_for_delivery: 'Seu pedido saiu para entrega!',
  delivered: 'Pedido entregue! Bom apetite!',
  cancelled: 'Houve uma atualização no seu pedido.',
};

export default function App() {
  const [route, setRoute] = useState<'store' | 'admin'>(() =>
    window.location.pathname.startsWith('/admin') ? 'admin' : 'store'
  );

  const [customerToken] = useState<string>(() => getOrCreateCustomerToken());
  const [catalog, setCatalog] = useState<StoreCatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Storefront interactive modals/sheets
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderInitialSize, setBuilderInitialSize] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<{
    product: Product;
    categoryName: string;
  } | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [trackingOpen, setTrackingOpen] = useState(false);

  // Cart & Customer Orders
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('tropicalia_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [cartBounceKey, setCartBounceKey] = useState(0);
  const [myOrders, setMyOrders] = useState<Order[]>(() => {
    try {
      const saved = localStorage.getItem('tropicalia_orders_history');
      return saved ? (JSON.parse(saved) as Order[]) : [];
    } catch {
      return [];
    }
  });
  const [activeTrackingOrder, setActiveTrackingOrder] = useState<Order | null>(null);
  const [liveToast, setLiveToast] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const hasSyncedOrdersRef = useRef(false);

  useEffect(() => {
    unlockAudioContext();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('tropicalia_orders_history', JSON.stringify(myOrders));
    } catch {
      // ignore storage quota errors
    }
  }, [myOrders]);

  useEffect(() => {
    const onPopState = () => {
      setRoute(window.location.pathname.startsWith('/admin') ? 'admin' : 'store');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigateTo = (next: 'store' | 'admin') => {
    const targetPath = next === 'admin' ? '/admin' : '/';
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
    setRoute(next);
  };

  useEffect(() => {
    localStorage.setItem('tropicalia_cart', JSON.stringify(cart));
  }, [cart]);

  const fetchCatalog = useCallback(async () => {
    try {
      setLoadError('');
      const res = await apiRequest('/api/store/catalog');
      if (!res.ok) throw new Error('Falha ao carregar cardápio');
      const data = (await res.json()) as StoreCatalogResponse;
      setCatalog(data);
    } catch {
      setLoadError('Não foi possível carregar o cardápio agora. Verifique sua conexão.');
    } finally {
      setLoading(false);
    }
  }, []);

  const notifyOrderStatusChange = useCallback((updated: Order) => {
    playCustomerUpdateSound();
    const statusMsg = STATUS_TOAST_MAP[updated.status] || 'Atualização no seu pedido!';
    setLiveToast(`Pedido #${updated.orderNumber}: ${statusMsg}`);
    if (navigator.vibrate) navigator.vibrate([40, 30, 40]);
    setTimeout(() => setLiveToast(''), 4200);
  }, []);

  const fetchMyOrders = useCallback(
    async (whatsapp?: string) => {
      try {
        const savedPhone = (localStorage.getItem('tropicalia_customer_whatsapp') || '').replace(/\D/g, '');
        const phoneToSend = whatsapp || (savedPhone.length >= 10 ? savedPhone : '');
        const qs = new URLSearchParams({ token: customerToken });
        if (phoneToSend) qs.set('whatsapp', phoneToSend);
        const res = await apiRequest(`/api/orders/mine?${qs.toString()}`);
        if (res.ok) {
          const list = (await res.json()) as Order[];
          setMyOrders((prev) => {
            if (hasSyncedOrdersRef.current) {
              const prevMap = new Map(prev.map((o) => [o.id, o]));
              for (const nextOrder of list) {
                const oldOrder = prevMap.get(nextOrder.id);
                if (oldOrder && oldOrder.status !== nextOrder.status) {
                  notifyOrderStatusChange(nextOrder);
                  break;
                }
              }
            }
            hasSyncedOrdersRef.current = true;
            const merged = mergeOrderHistory(list, prev);
            setActiveTrackingOrder((curr) =>
              curr ? merged.find((o) => o.id === curr.id) || merged[0] || null : merged[0] || null
            );
            return merged;
          });
        }
      } catch {
        // ignore background fetch error
      }
    },
    [customerToken, notifyOrderStatusChange]
  );

  useEffect(() => {
    if (route !== 'store') return;
    let closed = false;
    let retryTimer: ReturnType<typeof setTimeout>;
    let pingTimer: ReturnType<typeof setInterval>;
    let syncTimer: ReturnType<typeof setTimeout>;
    let unsubLocal: (() => void) | null = null;
    let hasConnectedOnce = false;

    const handleLiveMsg = (msg: { type: string; data: unknown; customerToken?: string }) => {
      if (msg.type === 'pong' || msg.type === 'subscribed') return;
      if (msg.type === 'catalog:updated') {
        setCatalog(msg.data as StoreCatalogResponse);
        playCustomerUpdateSound();
      } else if (msg.type === 'order:updated') {
        if (msg.customerToken && msg.customerToken !== customerToken) return;
        const updated = msg.data as Order;
        setMyOrders((prev) => mergeOrderHistory([updated], prev));
        setActiveTrackingOrder((curr) => (curr?.id === updated.id ? updated : curr));
        notifyOrderStatusChange(updated);
      }
    };

    const scheduleCustomerSync = () => {
      if (closed || isStandaloneMode()) return;
      clearTimeout(syncTimer);
      const wsHealthy = wsRef.current?.readyState === WebSocket.OPEN;
      const delay = wsHealthy ? 4500 : 1800;
      syncTimer = setTimeout(async () => {
        if (closed) return;
        await fetchMyOrders();
        scheduleCustomerSync();
      }, delay);
    };

    const connectWs = () => {
      if (isStandaloneMode() || closed) return;
      try {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
        wsRef.current = ws;

        ws.onopen = () => {
          const savedPhone = (localStorage.getItem('tropicalia_customer_whatsapp') || '').replace(/\D/g, '');
          ws.send(
            JSON.stringify({
              type: 'subscribe',
              channel: 'customer',
              customerToken,
              customerWhatsapp: savedPhone,
            })
          );
          clearInterval(pingTimer);
          pingTimer = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ping' }));
            }
          }, 15000);

          if (hasConnectedOnce) {
            fetchMyOrders();
          }
          hasConnectedOnce = true;
        };

        ws.onmessage = (ev) => {
          try {
            handleLiveMsg(JSON.parse(ev.data));
          } catch {
            // ignore
          }
        };

        ws.onclose = () => {
          clearInterval(pingTimer);
          if (!closed && !isStandaloneMode()) {
            retryTimer = setTimeout(connectWs, 1800);
          }
        };
      } catch {
        // ignore WebSocket errors on static hosts
      }
    };

    const onFocusOrVisible = () => {
      if (document.visibilityState === 'visible' && !isStandaloneMode()) {
        fetchMyOrders();
        if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
          clearTimeout(retryTimer);
          connectWs();
        }
      }
    };

    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);

    (async () => {
      await fetchCatalog();
      if (closed) return;
      await fetchMyOrders();
      if (closed) return;
      if (isStandaloneMode()) {
        unsubLocal = subscribeLocalSync(handleLiveMsg);
      } else {
        connectWs();
        scheduleCustomerSync();
      }
    })();

    return () => {
      closed = true;
      clearTimeout(retryTimer);
      clearTimeout(syncTimer);
      clearInterval(pingTimer);
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
      unsubLocal?.();
      wsRef.current?.close();
    };
  }, [route, customerToken, fetchCatalog, fetchMyOrders, notifyOrderStatusChange]);

  if (route === 'admin') {
    return <AdminPanel onBackToStore={() => navigateTo('store')} />;
  }

  if (loading && !catalog) {
    return <BrandSplash logoUrl="/assets/aistudio/image_82f9cbd7.png" />;
  }

  if (loadError || !catalog) {
    return (
      <div className="min-h-screen bg-[#2E0A3A] text-[#FFF4DC] flex flex-col items-center justify-center p-6 text-center gap-4">
        <img
          src="/assets/aistudio/image_82f9cbd7.png"
          alt="Tropicália Açaí"
          className="w-24 h-24 rounded-full border-4 border-[#F7B518]"
        />
        <h1 className="font-display text-2xl font-extrabold">Ops! Algo saiu do ritmo</h1>
        <p className="text-sm text-[#FFF4DC]/75 max-w-sm">
          {loadError || 'Não foi possível carregar o cardápio.'}
        </p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            fetchCatalog();
          }}
          className="min-h-[48px] px-6 rounded-full bg-[#F7B518] text-[#2E0A3A] font-display font-bold text-sm cursor-pointer"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const addItemToCart = (item: CartItem) => {
    setCart((prev) => [...prev, item]);
    setCartBounceKey((k) => k + 1);
    setLiveToast(`${item.name} adicionado ao carrinho!`);
    setTimeout(() => setLiveToast(''), 2500);
  };

  const handleQuickAddProduct = (product: Product, categoryName: string) => {
    addItemToCart({
      id: `quick-${product.id}-${Date.now()}`,
      productId: product.id,
      name: product.name,
      categoryName,
      isBuilder: false,
      unitPrice: product.price,
      quantity: 1,
      notes: '',
      imageUrl: product.imageUrl,
      selections: [],
    });
  };

  const activeOrdersCount = myOrders.filter(
    (o) => !['delivered', 'cancelled'].includes(o.status)
  ).length;

  return (
    <>
      {liveToast && (
        <div
          onClick={() => {
            if (liveToast.includes('Pedido #')) setTrackingOpen(true);
          }}
          className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-full bg-[#F7B518] text-[#2E0A3A] font-display font-extrabold text-xs sm:text-sm shadow-2xl cursor-pointer whitespace-nowrap"
        >
          {liveToast}
        </div>
      )}

      <Storefront
        settings={catalog.settings}
        categories={catalog.categories}
        products={catalog.products}
        builderConfig={catalog.builderConfig}
        isOpenNow={catalog.isOpenNow}
        cart={cart}
        cartBounceKey={cartBounceKey}
        activeOrdersCount={activeOrdersCount}
        onOpenBuilder={(sizeId) => {
          setBuilderInitialSize(sizeId || null);
          setBuilderOpen(true);
        }}
        onSelectProduct={(product, categoryName) =>
          setSelectedProduct({ product, categoryName })
        }
        onQuickAddProduct={handleQuickAddProduct}
        onOpenCart={() => setCartOpen(true)}
        onOpenTracking={() => {
          fetchMyOrders();
          setTrackingOpen(true);
        }}
      />

      <AcaiBuilderModal
        open={builderOpen}
        config={catalog.builderConfig}
        initialSizeId={builderInitialSize}
        onClose={() => setBuilderOpen(false)}
        onAddToCart={addItemToCart}
      />

      <ProductOptionsSheet
        product={selectedProduct?.product || null}
        categoryName={selectedProduct?.categoryName || ''}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={addItemToCart}
      />

      <CartDrawer
        open={cartOpen}
        items={cart}
        deliveryFee={catalog.settings.deliveryFee}
        isStoreOpen={catalog.isOpenNow}
        onClose={() => setCartOpen(false)}
        onUpdateQty={(id, delta) => {
          setCart((prev) =>
            prev
              .map((i) => (i.id === id ? { ...i, quantity: i.quantity + delta } : i))
              .filter((i) => i.quantity > 0)
          );
        }}
        onRemoveItem={(id) => setCart((prev) => prev.filter((i) => i.id !== id))}
        onCheckout={() => {
          setCartOpen(false);
          setCheckoutOpen(true);
        }}
      />

      <CheckoutAndPixFlow
        open={checkoutOpen}
        items={cart}
        settings={catalog.settings}
        customerToken={customerToken}
        onClose={() => setCheckoutOpen(false)}
        onOrderCreated={(order) => {
          setCart([]);
          setMyOrders((prev) => mergeOrderHistory([order], prev));
          setActiveTrackingOrder(order);
          playCustomerUpdateSound();
        }}
        onReceiptUploaded={(updated) => {
          setMyOrders((prev) => mergeOrderHistory([updated], prev));
          setActiveTrackingOrder(updated);
          playCustomerUpdateSound();
        }}
        onGoToTracking={(order) => {
          setCheckoutOpen(false);
          setActiveTrackingOrder(order);
          setTrackingOpen(true);
        }}
      />

      <OrderTrackingView
        open={trackingOpen}
        orders={myOrders}
        activeOrder={activeTrackingOrder}
        settings={catalog.settings}
        customerToken={customerToken}
        onSelectOrder={setActiveTrackingOrder}
        onClose={() => setTrackingOpen(false)}
        onRefreshOrders={fetchMyOrders}
        onReceiptUploaded={(updated) => {
          setMyOrders((prev) => mergeOrderHistory([updated], prev));
          setActiveTrackingOrder(updated);
          playCustomerUpdateSound();
        }}
      />
    </>
  );
}
