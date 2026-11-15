import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BarChart3,
  Check,
  CheckCircle2,
  ClipboardList,
  Copy,
  Eye,
  FileText,
  ImagePlus,
  Lock,
  LogOut,
  MapPin,
  Menu,
  MessageCircle,
  Package,
  Plus,
  Power,
  Printer,
  Search,
  Settings,
  Sliders,
  Trash2,
  Users,
  Volume2,
  X,
  XCircle,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  AdminReports,
  BuilderConfig,
  MenuCategory,
  Order,
  OrderStatus,
  PaymentMethod,
  Product,
  StaffRole,
  StaffUser,
  StoreSettings,
} from '../types';
import { apiRequest, isStandaloneMode, subscribeLocalSync } from '../utils/api';
import { formatBRL, formatElapsedTime } from '../utils/format';
import { playAdminUpdateSound, unlockAudioContext } from '../utils/sound';

interface AdminPanelProps {
  onBackToStore: () => void;
}

type AdminTab = 'orders' | 'menu' | 'builder' | 'settings' | 'reports';

const KANBAN_COLUMNS: { id: string; title: string; statuses: OrderStatus[] }[] = [
  { id: 'new', title: 'Novos / Pix', statuses: ['awaiting_payment', 'pending'] },
  { id: 'prep', title: 'Em preparo', statuses: ['preparing'] },
  { id: 'ready', title: 'Prontos', statuses: ['ready'] },
  { id: 'out', title: 'Saiu p/ entrega', statuses: ['out_for_delivery'] },
  { id: 'done', title: 'Finalizados', statuses: ['delivered', 'cancelled'] },
];

const QUICK_REJECT_REASONS = [
  'Ingrediente em falta no momento',
  'Pagamento Pix não identificado',
  'Endereço fora da área de entrega',
  'Loja encerrando expediente',
];

const DAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function CountUpBRL({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let frame = 0;
    const total = 20;
    const raf = requestAnimationFrame(function step() {
      frame += 1;
      setShown(value * (frame / total));
      if (frame < total) requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className="tabular-nums">R$ {formatBRL(shown)}</span>;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onBackToStore }) => {
  const [authToken, setAuthToken] = useState<string>(() => localStorage.getItem('tropicalia_staff_token') || '');
  const [staffUser, setStaffUser] = useState<StaffUser | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Login form
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // Navigation & UI
  const [activeTab, setActiveTab] = useState<AdminTab>('orders');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileColIdx, setMobileColIdx] = useState(0);
  const [toast, setToast] = useState('');

  useEffect(() => {
    unlockAudioContext();
  }, []);

  // Data
  const [orders, setOrders] = useState<Order[]>([]);
  const [highlightedOrderIds, setHighlightedOrderIds] = useState<Set<string>>(new Set());
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [isOpenNow, setIsOpenNow] = useState(true);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [builderConfig, setBuilderConfig] = useState<BuilderConfig | null>(null);
  const [reports, setReports] = useState<AdminReports | null>(null);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);

  // Order filters & modals
  const [orderSearch, setOrderSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'all' | PaymentMethod>('all');
  const [dateFilter, setDateFilter] = useState('');
  const [receiptModalOrder, setReceiptModalOrder] = useState<Order | null>(null);
  const [receiptZoom, setReceiptZoom] = useState(1);
  const [rejectModalOrder, setRejectModalOrder] = useState<Order | null>(null);
  const [rejectReason, setRejectReason] = useState(QUICK_REJECT_REASONS[0]);
  const [printOrder, setPrintOrder] = useState<Order | null>(null);

  // Product / Category editor modals
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [editingCategory, setEditingCategory] = useState<Partial<MenuCategory> | null>(null);
  const [menuCategoryFilter, setMenuCategoryFilter] = useState<string>('all');
  const [newUserForm, setNewUserForm] = useState({ name: '', email: '', password: '', role: 'attendant' as StaffRole });

  const wsRef = useRef<WebSocket | null>(null);
  const knownOrderIdsRef = useRef<Set<string>>(new Set());
  const knownOrdersMapRef = useRef<Map<string, Order>>(new Map());
  const hasLoadedOrdersRef = useRef(false);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3200);
  };

  const apiFetch = async (url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers);
    if (authToken) headers.set('Authorization', `Bearer ${authToken}`);
    return apiRequest(url, { ...options, headers });
  };

  // Verify existing session
  useEffect(() => {
    (async () => {
      if (!authToken) {
        setCheckingAuth(false);
        return;
      }
      try {
        const res = await apiRequest('/api/auth/me', {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (res.ok) {
          const data = await res.json();
          setStaffUser(data.user);
        } else {
          localStorage.removeItem('tropicalia_staff_token');
          setAuthToken('');
        }
      } finally {
        setCheckingAuth(false);
      }
    })();
  }, []);

  const applyIncomingOrdersList = (list: Order[], notifyNew: boolean) => {
    const prevIds = knownOrderIdsRef.current;
    const prevMap = knownOrdersMapRef.current;

    if (notifyNew && hasLoadedOrdersRef.current) {
      const newlyArrived = list.filter((o) => !prevIds.has(o.id));
      const newlyReceipted = list.filter((o) => {
        const prev = prevMap.get(o.id);
        return prev && !prev.pixReceiptUrl && Boolean(o.pixReceiptUrl);
      });

      if (newlyArrived.length > 0) {
        setHighlightedOrderIds((prev) => {
          const next = new Set(prev);
          newlyArrived.forEach((o) => next.add(o.id));
          return next;
        });
        playAdminUpdateSound('new_order');
        const first = newlyArrived[0];
        notify(
          newlyArrived.length === 1
            ? `Novo pedido #${first.orderNumber} de ${first.customerName}!`
            : `${newlyArrived.length} novos pedidos recebidos!`
        );
        loadOwnerExtras();
      } else if (newlyReceipted.length > 0) {
        playAdminUpdateSound('order_update');
        notify(`Comprovante recebido no pedido #${newlyReceipted[0].orderNumber}!`);
        loadOwnerExtras();
      }
    }

    const nextIds = new Set<string>();
    const nextMap = new Map<string, Order>();
    for (const o of list) {
      nextIds.add(o.id);
      nextMap.set(o.id, o);
    }
    knownOrderIdsRef.current = nextIds;
    knownOrdersMapRef.current = nextMap;
    hasLoadedOrdersRef.current = true;
    setOrders(list);
  };

  const syncOrdersFromServer = async (notifyNew: boolean) => {
    try {
      const ordRes = await apiFetch('/api/admin/orders');
      if (ordRes.ok) {
        const list = (await ordRes.json()) as Order[];
        applyIncomingOrdersList(list, notifyNew);
      }
    } catch {
      // ignore transient network errors during background sync
    }
  };

  const loadAllAdminData = async () => {
    const [catRes, ordRes] = await Promise.all([
      apiFetch('/api/store/catalog'),
      apiFetch('/api/admin/orders'),
    ]);
    if (catRes.ok) {
      const catData = await catRes.json();
      setSettings(catData.settings);
      setCategories(catData.categories);
      setProducts(catData.products);
      setBuilderConfig(catData.builderConfig);
      setIsOpenNow(catData.isOpenNow);
    }
    if (ordRes.ok) {
      const list = (await ordRes.json()) as Order[];
      applyIncomingOrdersList(list, false);
    }
  };

  const loadOwnerExtras = async () => {
    if (staffUser?.role !== 'owner') return;
    const [repRes, usrRes] = await Promise.all([
      apiFetch('/api/admin/reports'),
      apiFetch('/api/admin/users'),
    ]);
    if (repRes.ok) setReports(await repRes.json());
    if (usrRes.ok) setStaffUsers(await usrRes.json());
  };

  // Connect WebSocket once logged in + heartbeat + reconnect catch-up + safety sync
  useEffect(() => {
    if (!staffUser || !authToken) return;
    let closed = false;
    let retryTimer: ReturnType<typeof setTimeout>;
    let pingTimer: ReturnType<typeof setInterval>;
    let syncTimer: ReturnType<typeof setTimeout>;
    let unsubLocal: (() => void) | null = null;
    let hasConnectedOnce = false;

    const handleMsg = (msg: { type: string; data: unknown }) => {
      if (msg.type === 'pong' || msg.type === 'subscribed') return;
      if (msg.type === 'order:created') {
        const incoming = msg.data as Order;
        const alreadyKnown = knownOrderIdsRef.current.has(incoming.id);
        knownOrderIdsRef.current.add(incoming.id);
        knownOrdersMapRef.current.set(incoming.id, incoming);
        setOrders((prev) => (prev.some((o) => o.id === incoming.id) ? prev : [incoming, ...prev]));
        if (!alreadyKnown) {
          setHighlightedOrderIds((prev) => new Set(prev).add(incoming.id));
          playAdminUpdateSound('new_order');
          notify(`Novo pedido #${incoming.orderNumber} de ${incoming.customerName}!`);
          loadOwnerExtras();
        }
      } else if (msg.type === 'order:updated') {
        const updated = msg.data as Order;
        knownOrderIdsRef.current.add(updated.id);
        knownOrdersMapRef.current.set(updated.id, updated);
        setOrders((prev) =>
          prev.some((o) => o.id === updated.id)
            ? prev.map((o) => (o.id === updated.id ? updated : o))
            : [updated, ...prev]
        );
        playAdminUpdateSound('order_update');
        notify(`Atualização no pedido #${updated.orderNumber}!`);
        loadOwnerExtras();
      } else if (msg.type === 'catalog:updated') {
        const d = msg.data as {
          settings: StoreSettings;
          categories: MenuCategory[];
          products: Product[];
          builderConfig: BuilderConfig;
          isOpenNow: boolean;
        };
        setSettings(d.settings);
        setCategories(d.categories);
        setProducts(d.products);
        setBuilderConfig(d.builderConfig);
        setIsOpenNow(d.isOpenNow);
        playAdminUpdateSound('catalog_update');
      }
    };

    const scheduleSyncPoll = () => {
      if (closed || isStandaloneMode()) return;
      clearTimeout(syncTimer);
      const wsHealthy = wsRef.current?.readyState === WebSocket.OPEN;
      const delay = wsHealthy ? 4000 : 1500;
      syncTimer = setTimeout(async () => {
        if (closed) return;
        await syncOrdersFromServer(true);
        scheduleSyncPoll();
      }, delay);
    };

    const connect = () => {
      if (isStandaloneMode() || closed) return;
      try {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
        wsRef.current = ws;

        ws.onopen = () => {
          ws.send(JSON.stringify({ type: 'subscribe', channel: 'admin', token: authToken }));
          clearInterval(pingTimer);
          pingTimer = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ping' }));
            }
          }, 15000);

          if (hasConnectedOnce) {
            syncOrdersFromServer(true);
            loadOwnerExtras();
          }
          hasConnectedOnce = true;
        };

        ws.onmessage = (ev) => {
          try {
            handleMsg(JSON.parse(ev.data));
          } catch {
            // ignore
          }
        };

        ws.onclose = () => {
          clearInterval(pingTimer);
          if (!closed && !isStandaloneMode()) {
            retryTimer = setTimeout(connect, 1500);
          }
        };
      } catch {
        // ignore WebSocket errors on static hosts
      }
    };

    const onVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible' && !isStandaloneMode()) {
        syncOrdersFromServer(true);
        if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
          clearTimeout(retryTimer);
          connect();
        }
      }
    };

    window.addEventListener('focus', onVisibilityOrFocus);
    document.addEventListener('visibilitychange', onVisibilityOrFocus);

    (async () => {
      await loadAllAdminData();
      if (closed) return;
      await loadOwnerExtras();
      if (closed) return;
      if (isStandaloneMode()) {
        unsubLocal = subscribeLocalSync(handleMsg);
      } else {
        connect();
        scheduleSyncPoll();
      }
    })();

    return () => {
      closed = true;
      clearTimeout(retryTimer);
      clearTimeout(syncTimer);
      clearInterval(pingTimer);
      window.removeEventListener('focus', onVisibilityOrFocus);
      document.removeEventListener('visibilitychange', onVisibilityOrFocus);
      unsubLocal?.();
      wsRef.current?.close();
    };
  }, [staffUser, authToken]);

  // Refresh elapsed time badges every 30s
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError('');
    try {
      const res = await apiRequest('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || 'E-mail ou senha inválidos.');
        return;
      }
      localStorage.setItem('tropicalia_staff_token', data.token);
      setAuthToken(data.token);
      setStaffUser(data.user);
      unlockAudioContext();
      playAdminUpdateSound('order_update');
    } catch {
      setLoginError('Erro ao conectar ao servidor.');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    localStorage.removeItem('tropicalia_staff_token');
    setAuthToken('');
    setStaffUser(null);
  };

  const handleUpdateOrderStatus = async (order: Order, status: OrderStatus, reason?: string) => {
    const res = await apiFetch(`/api/admin/orders/${order.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, cancelReason: reason }),
    });
    const data = await res.json();
    if (!res.ok) {
      notify(data.error || 'Não foi possível atualizar o status.');
      return;
    }
    setOrders((prev) => prev.map((o) => (o.id === data.id ? data : o)));
    setHighlightedOrderIds((prev) => {
      const next = new Set(prev);
      next.delete(order.id);
      return next;
    });
    notify(`Pedido #${order.orderNumber} atualizado!`);
  };

  const handleConfirmPix = async (order: Order) => {
    const res = await apiFetch(`/api/admin/orders/${order.id}/confirm-pix`, { method: 'POST' });
    if (res.ok) {
      const data = (await res.json()) as Order;
      setOrders((prev) => prev.map((o) => (o.id === data.id ? data : o)));
      if (receiptModalOrder?.id === order.id) setReceiptModalOrder(data);
      notify(`Pagamento Pix do pedido #${order.orderNumber} confirmado!`);
    }
  };

  const handleToggleAvailability = async (product: Product) => {
    const res = await apiFetch(`/api/admin/products/${product.id}/availability`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ available: !product.available }),
    });
    if (res.ok) {
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, available: !p.available } : p))
      );
      notify(`${product.name} marcado como ${!product.available ? 'disponível' : 'esgotado'}.`);
    }
  };

  const handleToggleStoreOpen = async (mode: StoreSettings['manualOpenOverride']) => {
    const res = await apiFetch('/api/admin/store-open', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manualOpenOverride: mode }),
    });
    if (res.ok) {
      const data = await res.json();
      setSettings(data.settings);
      setIsOpenNow(data.isOpenNow);
      notify(data.isOpenNow ? 'Loja aberta para pedidos!' : 'Loja fechada manualmente.');
    }
  };

  const handleFileUpload = async (file: File): Promise<string | null> => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await apiFetch('/api/admin/upload', { method: 'POST', body: fd });
    if (!res.ok) {
      notify('Falha no upload do arquivo.');
      return null;
    }
    const data = await res.json();
    return data.url as string;
  };

  const handleSaveSettings = async (nextSettings: StoreSettings) => {
    const res = await apiFetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextSettings),
    });
    if (res.ok) {
      const data = await res.json();
      setSettings(data.settings);
      setIsOpenNow(data.isOpenNow);
      notify('Configurações salvas e publicadas ao vivo!');
    }
  };

  const handleSaveBuilder = async (nextConfig: BuilderConfig) => {
    const res = await apiFetch('/api/admin/builder', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextConfig),
    });
    if (res.ok) {
      setBuilderConfig(await res.json());
      notify('Regras do montador atualizadas no cardápio!');
    }
  };

  const handlePrintThermal = (order: Order) => {
    setPrintOrder(order);
    setTimeout(() => window.print(), 150);
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (paymentFilter !== 'all' && o.paymentMethod !== paymentFilter) return false;
      if (dateFilter && o.createdAt.slice(0, 10) !== dateFilter) return false;
      if (orderSearch.trim()) {
        const q = orderSearch.toLowerCase().trim();
        const matchName = o.customerName.toLowerCase().includes(q);
        const matchNum = String(o.orderNumber).includes(q.replace('#', ''));
        if (!matchName && !matchNum) return false;
      }
      return true;
    });
  }, [orders, paymentFilter, dateFilter, orderSearch]);

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#2E0A3A] flex items-center justify-center text-[#FFF4DC]">
        <div className="font-display text-lg font-bold animate-pulse">Carregando painel...</div>
      </div>
    );
  }

  // LOGIN SCREEN
  if (!staffUser) {
    return (
      <div className="min-h-screen bg-[#2E0A3A] text-[#FFF4DC] flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md rounded-[28px] bg-[#4A1259] border border-[#62207A] p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="flex flex-col items-center text-center gap-3">
            <img
              src="/assets/aistudio/image_82f9cbd7.png"
              alt="Tropicália Açaí"
              className="w-20 h-20 rounded-full border-4 border-[#F7B518] shadow-lg"
            />
            <div>
              <h1 className="font-display text-2xl font-extrabold">Painel Tropicália Açaí</h1>
              <p className="text-xs text-[#FFF4DC]/75 mt-1">
                Entre com sua conta de Dono ou Atendente
              </p>
            </div>
          </div>

          {loginError && (
            <div className="p-3 rounded-2xl bg-[#FF6B5E]/20 border border-[#FF6B5E] text-xs font-bold text-[#FFF4DC]">
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold mb-1.5">E-mail</label>
              <input
                type="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full min-h-[46px] rounded-2xl bg-[#2E0A3A] border border-[#62207A] focus:border-[#F7B518] focus:outline-none px-4 text-sm text-[#FFF4DC]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1.5">Senha</label>
              <input
                type="password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full min-h-[46px] rounded-2xl bg-[#2E0A3A] border border-[#62207A] focus:border-[#F7B518] focus:outline-none px-4 text-sm text-[#FFF4DC]"
              />
            </div>
            <button
              type="submit"
              disabled={loggingIn}
              className="w-full min-h-[48px] rounded-full bg-[#F7B518] hover:bg-[#FFD45C] text-[#2E0A3A] font-display font-extrabold text-base shadow-lg shadow-[#F7B518]/20 cursor-pointer flex items-center justify-center gap-2"
            >
              <Lock className="w-4 h-4" />
              {loggingIn ? 'Entrando...' : 'Entrar no painel'}
            </button>
          </form>

          <button
            type="button"
            onClick={onBackToStore}
            className="w-full text-center text-xs text-[#FFF4DC]/70 hover:text-[#F7B518] flex items-center justify-center gap-1 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Voltar ao cardápio do cliente
          </button>
        </div>
      </div>
    );
  }

  const isOwner = staffUser.role === 'owner';

  const navItems: { id: AdminTab; label: string; icon: React.ReactNode; ownerOnly?: boolean }[] = [
    { id: 'orders', label: 'Pedidos', icon: <ClipboardList className="w-5 h-5" /> },
    { id: 'menu', label: isOwner ? 'Cardápio' : 'Esgotados', icon: <Package className="w-5 h-5" /> },
    { id: 'builder', label: 'Montador', icon: <Sliders className="w-5 h-5" />, ownerOnly: true },
    { id: 'reports', label: 'Relatórios', icon: <BarChart3 className="w-5 h-5" />, ownerOnly: true },
    { id: 'settings', label: isOwner ? 'Configurações' : 'Loja Aberta', icon: <Settings className="w-5 h-5" /> },
  ];

  const visibleNav = navItems.filter((n) => !n.ownerOnly || isOwner);

  const renderOrderCard = (order: Order) => {
    const elapsed = formatElapsedTime(order.createdAt);
    const isHighlighted = highlightedOrderIds.has(order.id);
    const mapsUrl =
      order.address?.lat && order.address?.lng
        ? `https://www.google.com/maps?q=${order.address.lat},${order.address.lng}`
        : order.address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            `${order.address.street}, ${order.address.number}, ${order.address.neighborhood}`
          )}`
        : null;

    return (
      <div
        key={order.id}
        className={`p-4 rounded-2xl bg-[#4A1259] border space-y-3 transition-all ${
          isHighlighted
            ? 'border-[#F7B518] animate-order-pulse'
            : 'border-[#62207A]'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display text-lg font-extrabold text-[#F7B518]">
                #{order.orderNumber}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                  elapsed.level === 'ok'
                    ? 'bg-[#3DDC84]/20 text-[#3DDC84]'
                    : elapsed.level === 'warn'
                    ? 'bg-[#F7B518]/25 text-[#F7B518]'
                    : 'bg-[#FF6B5E]/25 text-[#FF6B5E]'
                }`}
              >
                {elapsed.label}
              </span>
              <span className="text-[10px] text-[#FFF4DC]/60 tabular-nums">
                {new Date(order.createdAt).toLocaleString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <div className="font-bold text-sm text-[#FFF4DC] mt-0.5">{order.customerName}</div>
            <a
              href={`https://wa.me/55${order.customerWhatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-[#3DDC84] hover:underline"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              {order.customerWhatsapp}
            </a>
          </div>

          <div className="text-right">
            <div className="font-display text-base font-extrabold text-[#F7B518] tabular-nums">
              R$ {formatBRL(order.total)}
            </div>
            <div className="text-[11px] font-bold text-[#FFF4DC]/75 uppercase">
              {order.paymentMethod === 'pix'
                ? order.pixConfirmed
                  ? 'Pix confirmado'
                  : 'Pix pendente'
                : order.paymentMethod === 'card'
                ? 'Cartão'
                : order.cashChangeFor
                ? `Dinheiro (troco R$ ${formatBRL(order.cashChangeFor)})`
                : 'Dinheiro (s/ troco)'}
            </div>
          </div>
        </div>

        {/* Delivery / Pickup */}
        <div className="text-xs bg-[#2E0A3A]/70 rounded-xl p-2.5 flex items-start justify-between gap-2">
          <div>
            <span className="font-bold text-[#F7B518]">
              {order.deliveryType === 'delivery' ? 'Entrega: ' : 'Retirada no balcão'}
            </span>
            {order.deliveryType === 'delivery' && order.address && (
              <span className="text-[#FFF4DC]/85">
                {order.address.street}, {order.address.number} - {order.address.neighborhood}
                {order.address.reference ? ` (${order.address.reference})` : ''}
              </span>
            )}
          </div>
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#F7B518] hover:underline shrink-0 flex items-center gap-0.5 font-bold"
            >
              <MapPin className="w-3.5 h-3.5" />
              Mapa
            </a>
          )}
        </div>

        {/* Items */}
        <div className="space-y-1.5 text-xs">
          {order.items.map((item) => (
            <div key={item.id} className="pb-1.5 border-b border-[#62207A]/50 last:border-0">
              <div className="font-bold text-[#FFF4DC]">
                {item.quantity}x {item.name}
              </div>
              {item.selections.length > 0 && (
                <div className="text-[11px] text-[#FFF4DC]/75">
                  {item.selections
                    .map(
                      (s) =>
                        `${s.groupTitle}: ${s.items
                          .map((i) => (i.quantity > 1 ? `${i.quantity}x ${i.name}` : i.name))
                          .join(', ')}`
                    )
                    .join(' · ')}
                </div>
              )}
              {item.notes && (
                <div className="text-[11px] text-[#FFD45C] font-semibold">Obs: {item.notes}</div>
              )}
            </div>
          ))}
        </div>

        {/* Pix Actions */}
        {order.paymentMethod === 'pix' && (
          <div className="flex flex-wrap gap-2">
            {order.pixReceiptUrl ? (
              <button
                type="button"
                onClick={() => {
                  setReceiptZoom(1);
                  setReceiptModalOrder(order);
                }}
                className="flex-1 min-h-[36px] px-3 rounded-xl bg-[#2E0A3A] hover:bg-[#62207A] text-xs font-bold text-[#F7B518] flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
                Ver comprovante
              </button>
            ) : (
              <span className="text-[11px] text-[#FF6B5E] font-bold">
                Aguardando envio do comprovante pelo cliente
              </span>
            )}
            {!order.pixConfirmed && order.status !== 'cancelled' && (
              <button
                type="button"
                onClick={() => handleConfirmPix(order)}
                className="flex-1 min-h-[36px] px-3 rounded-xl bg-[#3DDC84] text-[#2E0A3A] text-xs font-extrabold flex items-center justify-center gap-1 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5 stroke-[3]" />
                Confirmar pagamento
              </button>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {(order.status === 'pending' || (order.status === 'awaiting_payment' && order.pixConfirmed)) && (
            <button
              type="button"
              onClick={() => handleUpdateOrderStatus(order, 'preparing')}
              className="flex-1 min-h-[38px] px-3 rounded-full bg-[#F7B518] hover:bg-[#FFD45C] text-[#2E0A3A] text-xs font-extrabold cursor-pointer"
            >
              Aceitar e preparar
            </button>
          )}
          {order.status === 'preparing' && (
            <button
              type="button"
              onClick={() => handleUpdateOrderStatus(order, 'ready')}
              className="flex-1 min-h-[38px] px-3 rounded-full bg-[#F7B518] hover:bg-[#FFD45C] text-[#2E0A3A] text-xs font-extrabold cursor-pointer"
            >
              Marcar como pronto
            </button>
          )}
          {order.status === 'ready' && order.deliveryType === 'delivery' && (
            <button
              type="button"
              onClick={() => handleUpdateOrderStatus(order, 'out_for_delivery')}
              className="flex-1 min-h-[38px] px-3 rounded-full bg-[#F7B518] hover:bg-[#FFD45C] text-[#2E0A3A] text-xs font-extrabold cursor-pointer"
            >
              Saiu para entrega
            </button>
          )}
          {(order.status === 'out_for_delivery' ||
            (order.status === 'ready' && order.deliveryType === 'pickup')) && (
            <button
              type="button"
              onClick={() => handleUpdateOrderStatus(order, 'delivered')}
              className="flex-1 min-h-[38px] px-3 rounded-full bg-[#3DDC84] text-[#2E0A3A] text-xs font-extrabold cursor-pointer"
            >
              Finalizar pedido
            </button>
          )}

          {!['delivered', 'cancelled'].includes(order.status) && (
            <button
              type="button"
              onClick={() => {
                setRejectReason(QUICK_REJECT_REASONS[0]);
                setRejectModalOrder(order);
              }}
              className="min-h-[38px] px-3 rounded-full bg-[#FF6B5E]/20 hover:bg-[#FF6B5E]/35 text-[#FF6B5E] text-xs font-bold cursor-pointer"
            >
              Recusar
            </button>
          )}

          <button
            type="button"
            onClick={() => handlePrintThermal(order)}
            title="Imprimir cupom térmico"
            className="min-h-[38px] min-w-[38px] rounded-full bg-[#2E0A3A] hover:bg-[#62207A] flex items-center justify-center text-[#FFF4DC] cursor-pointer"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#2E0A3A] text-[#FFF4DC] flex flex-col lg:flex-row pb-20 lg:pb-0">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-[70] px-5 py-3 rounded-full bg-[#F7B518] text-[#2E0A3A] font-display font-bold text-sm shadow-2xl">
          {toast}
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 bg-[#4A1259] border-r border-[#62207A] transition-all ${
          sidebarOpen ? 'w-64' : 'w-20'
        }`}
      >
        <div className="p-4 flex items-center justify-between border-b border-[#62207A]">
          {sidebarOpen && (
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src={settings?.logoUrl || '/assets/aistudio/image_82f9cbd7.png'}
                alt="Tropicália"
                className="w-9 h-9 rounded-full border-2 border-[#F7B518]"
              />
              <div className="min-w-0">
                <div className="font-display font-extrabold text-sm truncate">Tropicália Admin</div>
                <div className="text-[11px] text-[#F7B518] font-bold">
                  {isOwner ? 'Perfil Dono' : 'Perfil Atendente'}
                </div>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setSidebarOpen((s) => !s)}
            className="p-2 rounded-xl hover:bg-[#62207A] cursor-pointer"
            aria-label="Alternar menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1.5">
          {visibleNav.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`w-full min-h-[46px] px-3.5 rounded-2xl flex items-center gap-3 font-bold text-sm transition-colors cursor-pointer ${
                activeTab === item.id
                  ? 'bg-[#F7B518] text-[#2E0A3A]'
                  : 'text-[#FFF4DC]/80 hover:bg-[#62207A]'
              }`}
            >
              {item.icon}
              {sidebarOpen && <span>{item.label}</span>}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-[#62207A] space-y-2">
          <button
            type="button"
            onClick={onBackToStore}
            className="w-full min-h-[42px] px-3 rounded-xl bg-[#2E0A3A] hover:bg-[#62207A] text-xs font-bold flex items-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-[#F7B518]" />
            {sidebarOpen && <span>Ver cardápio cliente</span>}
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full min-h-[42px] px-3 rounded-xl hover:bg-[#FF6B5E]/20 text-xs font-bold text-[#FF6B5E] flex items-center gap-2 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            {sidebarOpen && <span>Sair ({staffUser.name.split(' ')[0]})</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Control Bar */}
        <header className="sticky top-0 z-30 bg-[#2E0A3A]/95 backdrop-blur-md border-b border-[#62207A] px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-xl sm:text-2xl font-extrabold">
              {visibleNav.find((n) => n.id === activeTab)?.label}
            </h1>
            <button
              type="button"
              onClick={() => handleToggleStoreOpen(isOpenNow ? 'closed' : 'open')}
              className={`px-3 py-1.5 rounded-full text-xs font-extrabold flex items-center gap-1.5 cursor-pointer ${
                isOpenNow
                  ? 'bg-[#3DDC84]/20 text-[#3DDC84] border border-[#3DDC84]/50'
                  : 'bg-[#FF6B5E]/20 text-[#FF6B5E] border border-[#FF6B5E]/50'
              }`}
            >
              <Power className="w-3.5 h-3.5" />
              {isOpenNow ? 'Loja Aberta' : 'Loja Fechada'}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                unlockAudioContext();
                playAdminUpdateSound('new_order');
                notify('Alerta sonoro sempre ativo!');
              }}
              title="Som sempre ativo — toque para testar"
              className="min-h-[40px] px-3 rounded-full text-xs font-bold flex items-center gap-1.5 cursor-pointer bg-[#4A1259] text-[#3DDC84] border border-[#3DDC84]/40"
            >
              <Volume2 className="w-4 h-4" />
              <span className="hidden sm:inline">Som sempre ativo</span>
            </button>

            <button
              type="button"
              onClick={onBackToStore}
              className="lg:hidden min-h-[40px] px-3 rounded-full bg-[#4A1259] text-xs font-bold cursor-pointer"
            >
              Cardápio
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 overflow-x-hidden">
          {/* ================= TAB 1: ORDERS KANBAN ================= */}
          {activeTab === 'orders' && (
            <div className="space-y-4">
              {/* Filters */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="relative sm:col-span-2">
                  <Search className="w-4 h-4 text-[#FFF4DC]/50 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                    placeholder="Buscar por nome do cliente ou #número..."
                    className="w-full min-h-[42px] rounded-2xl bg-[#4A1259] border border-[#62207A] pl-10 pr-4 text-sm text-[#FFF4DC]"
                  />
                </div>
                <select
                  value={paymentFilter}
                  onChange={(e) => setPaymentFilter(e.target.value as 'all' | PaymentMethod)}
                  className="min-h-[42px] rounded-2xl bg-[#4A1259] border border-[#62207A] px-3 text-sm text-[#FFF4DC]"
                >
                  <option value="all">Todas as formas de pagamento</option>
                  <option value="pix">Pix</option>
                  <option value="card">Cartão</option>
                  <option value="cash">Dinheiro</option>
                </select>
                <input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="min-h-[42px] rounded-2xl bg-[#4A1259] border border-[#62207A] px-3 text-sm text-[#FFF4DC]"
                />
              </div>

              {/* Mobile Column Tabs */}
              <div className="flex lg:hidden gap-2 overflow-x-auto no-scrollbar pb-1">
                {KANBAN_COLUMNS.map((col, idx) => {
                  const count = filteredOrders.filter((o) => col.statuses.includes(o.status)).length;
                  return (
                    <button
                      key={col.id}
                      type="button"
                      onClick={() => setMobileColIdx(idx)}
                      className={`shrink-0 px-3.5 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                        mobileColIdx === idx
                          ? 'bg-[#F7B518] text-[#2E0A3A]'
                          : 'bg-[#4A1259] text-[#FFF4DC]/80'
                      }`}
                    >
                      <span>{col.title}</span>
                      <span className="px-1.5 py-0.5 rounded-full bg-black/20 tabular-nums">
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Mobile Single Active Column */}
              <div className="lg:hidden space-y-3">
                {filteredOrders
                  .filter((o) => KANBAN_COLUMNS[mobileColIdx].statuses.includes(o.status))
                  .map(renderOrderCard)}
              </div>

              {/* Desktop 5-Column Kanban */}
              <div className="hidden lg:grid lg:grid-cols-5 gap-4 items-start">
                {KANBAN_COLUMNS.map((col) => {
                  const colOrders = filteredOrders.filter((o) => col.statuses.includes(o.status));
                  return (
                    <div
                      key={col.id}
                      className="rounded-3xl bg-[#4A1259]/40 border border-[#62207A] p-3 space-y-3 min-h-[480px]"
                    >
                      <div className="flex items-center justify-between px-1">
                        <h2 className="font-display font-bold text-sm text-[#FFF4DC]">
                          {col.title}
                        </h2>
                        <span className="px-2 py-0.5 rounded-full bg-[#2E0A3A] text-[#F7B518] text-xs font-extrabold tabular-nums">
                          {colOrders.length}
                        </span>
                      </div>
                      <div className="space-y-3">
                        {colOrders.length === 0 ? (
                          <p className="text-xs text-[#FFF4DC]/40 text-center py-8">
                            Nenhum pedido nesta etapa
                          </p>
                        ) : (
                          colOrders.map(renderOrderCard)
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ================= TAB 2: MENU MANAGEMENT ================= */}
          {activeTab === 'menu' && (
            <div className="space-y-6">
              {isOwner && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setEditingProduct({
                          categoryId: categories[2]?.id || categories[0]?.id,
                          name: '',
                          description: '',
                          price: 15,
                          badge: '',
                          available: true,
                          alcoholWarning: false,
                          imageUrl: '',
                          optionGroups: [],
                        })
                      }
                      className="min-h-[44px] px-5 rounded-full bg-[#F7B518] text-[#2E0A3A] font-display font-bold text-sm flex items-center gap-2 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      Novo produto
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setEditingCategory({
                          name: '',
                          subtitle: '',
                          isStar: false,
                          layoutType: 'list',
                        })
                      }
                      className="min-h-[44px] px-5 rounded-full bg-[#4A1259] hover:bg-[#62207A] text-[#FFF4DC] font-display font-bold text-sm flex items-center gap-2 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      Nova categoria
                    </button>
                  </div>

                  <select
                    value={menuCategoryFilter}
                    onChange={(e) => setMenuCategoryFilter(e.target.value)}
                    className="min-h-[42px] rounded-2xl bg-[#4A1259] border border-[#62207A] px-3 text-sm"
                  >
                    <option value="all">Todas as categorias ({products.length})</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Categories reorder (Owner) */}
              {isOwner && (
                <div className="p-4 rounded-3xl bg-[#4A1259]/55 border border-[#62207A] space-y-3">
                  <h2 className="font-display font-bold text-base text-[#F7B518]">
                    Ordem das categorias no cardápio
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {categories.map((cat, idx) => (
                      <div
                        key={cat.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-[#2E0A3A] border border-[#62207A] text-xs font-bold"
                      >
                        <span>{cat.name}</span>
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={async () => {
                            const next = [...categories];
                            [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                            await apiFetch('/api/admin/categories/reorder', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ orderedIds: next.map((c) => c.id) }),
                            });
                            setCategories(next);
                          }}
                          className="p-1 hover:text-[#F7B518] disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === categories.length - 1}
                          onClick={async () => {
                            const next = [...categories];
                            [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
                            await apiFetch('/api/admin/categories/reorder', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ orderedIds: next.map((c) => c.id) }),
                            });
                            setCategories(next);
                          }}
                          className="p-1 hover:text-[#F7B518] disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Products Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {products
                  .filter((p) => menuCategoryFilter === 'all' || p.categoryId === menuCategoryFilter)
                  .map((product) => (
                    <div
                      key={product.id}
                      className={`p-4 rounded-2xl bg-[#4A1259] border flex flex-col justify-between gap-3 ${
                        product.available ? 'border-[#62207A]' : 'border-[#FF6B5E]/60 opacity-75'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              className="w-14 h-14 rounded-xl object-cover shrink-0"
                            />
                          ) : (
                            <div className="w-14 h-14 rounded-xl bg-[#2E0A3A] flex items-center justify-center text-[#F7B518] shrink-0">
                              <ImagePlus className="w-5 h-5" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-display font-bold text-base truncate">
                              {product.name}
                            </div>
                            <div className="text-xs text-[#FFF4DC]/70 truncate">
                              {categories.find((c) => c.id === product.categoryId)?.name}
                            </div>
                            {isOwner && (
                              <div className="font-display font-bold text-sm text-[#F7B518] tabular-nums">
                                R$ {formatBRL(product.price)}
                              </div>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleToggleAvailability(product)}
                          className={`px-3 py-1.5 rounded-full text-xs font-extrabold shrink-0 cursor-pointer ${
                            product.available
                              ? 'bg-[#3DDC84]/20 text-[#3DDC84]'
                              : 'bg-[#FF6B5E] text-white'
                          }`}
                        >
                          {product.available ? 'Disponível' : 'Esgotado'}
                        </button>
                      </div>

                      {isOwner && (
                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#62207A]">
                          <button
                            type="button"
                            onClick={() => setEditingProduct(product)}
                            className="px-3 py-1.5 rounded-xl bg-[#2E0A3A] hover:bg-[#62207A] text-xs font-bold cursor-pointer"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              const res = await apiFetch(
                                `/api/admin/products/${product.id}/duplicate`,
                                { method: 'POST' }
                              );
                              if (res.ok) {
                                setProducts(await res.json());
                                notify('Produto duplicado!');
                              }
                            }}
                            className="p-2 rounded-xl bg-[#2E0A3A] hover:bg-[#62207A] cursor-pointer"
                            title="Duplicar"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              const res = await apiFetch(`/api/admin/products/${product.id}`, {
                                method: 'DELETE',
                              });
                              if (res.ok) {
                                setProducts((prev) => prev.filter((x) => x.id !== product.id));
                                notify('Produto excluído.');
                              }
                            }}
                            className="p-2 rounded-xl bg-[#FF6B5E]/20 text-[#FF6B5E] hover:bg-[#FF6B5E]/35 cursor-pointer"
                            title="Excluir"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* ================= TAB 3: BUILDER EDITOR (OWNER) ================= */}
          {activeTab === 'builder' && isOwner && builderConfig && (
            <div className="space-y-6 max-w-5xl">
              <div className="flex items-center justify-between">
                <p className="text-sm text-[#FFF4DC]/80">
                  Altere preços dos tamanhos, Dose Dupla, preços de adicionais e disponibilidade de ingredientes.
                </p>
                <button
                  type="button"
                  onClick={() => handleSaveBuilder(builderConfig)}
                  className="min-h-[44px] px-6 rounded-full bg-[#F7B518] text-[#2E0A3A] font-display font-extrabold text-sm cursor-pointer"
                >
                  Salvar e publicar no cardápio
                </button>
              </div>

              <div className="p-5 rounded-3xl bg-[#4A1259] border border-[#62207A] space-y-4">
                <h2 className="font-display text-lg font-bold text-[#F7B518]">
                  Tamanhos &amp; Dose Dupla
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[...builderConfig.sizes, ...builderConfig.doseDupla].map((sz) => {
                    const isDD = Boolean(sz.isDoseDupla);
                    return (
                      <div key={sz.id} className="p-3 rounded-2xl bg-[#2E0A3A] space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm">{sz.name}</span>
                          <input
                            type="checkbox"
                            checked={sz.available}
                            onChange={(e) => {
                              const next = { ...builderConfig };
                              const list = isDD ? next.doseDupla : next.sizes;
                              const target = list.find((x) => x.id === sz.id);
                              if (target) target.available = e.target.checked;
                              setBuilderConfig(next);
                            }}
                            className="accent-[#F7B518]"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <label>
                            Preço (R$)
                            <input
                              type="number"
                              step="0.01"
                              value={sz.price}
                              onChange={(e) => {
                                const next = { ...builderConfig };
                                const list = isDD ? next.doseDupla : next.sizes;
                                const target = list.find((x) => x.id === sz.id);
                                if (target) target.price = Number(e.target.value);
                                setBuilderConfig(next);
                              }}
                              className="w-full mt-1 rounded-xl bg-[#4A1259] px-2.5 py-1.5 text-xs"
                            />
                          </label>
                          <label>
                            Extra Calda/Fruta
                            <input
                              type="number"
                              step="0.5"
                              value={sz.extraPrice}
                              onChange={(e) => {
                                const next = { ...builderConfig };
                                const list = isDD ? next.doseDupla : next.sizes;
                                const target = list.find((x) => x.id === sz.id);
                                if (target) target.extraPrice = Number(e.target.value);
                                setBuilderConfig(next);
                              }}
                              className="w-full mt-1 rounded-xl bg-[#4A1259] px-2.5 py-1.5 text-xs"
                            />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {builderConfig.steps.map((step, sIdx) => (
                <div
                  key={step.id}
                  className="p-5 rounded-3xl bg-[#4A1259] border border-[#62207A] space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-display text-lg font-bold text-[#F7B518]">{step.title}</h3>
                    <button
                      type="button"
                      onClick={() => {
                        const next = { ...builderConfig };
                        next.steps[sIdx].items.push({
                          id: `opt-${Date.now()}`,
                          name: 'Novo item',
                          price: step.id === 'adicionais' ? 3 : 0,
                          available: true,
                        });
                        setBuilderConfig(next);
                      }}
                      className="px-3 py-1.5 rounded-full bg-[#2E0A3A] text-xs font-bold text-[#F7B518] cursor-pointer"
                    >
                      + Adicionar opção
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {step.items.map((item, iIdx) => (
                      <div
                        key={item.id}
                        className="p-2.5 rounded-xl bg-[#2E0A3A] flex items-center gap-2"
                      >
                        <input
                          type="checkbox"
                          checked={item.available}
                          onChange={(e) => {
                            const next = { ...builderConfig };
                            next.steps[sIdx].items[iIdx].available = e.target.checked;
                            setBuilderConfig(next);
                          }}
                          className="accent-[#F7B518]"
                        />
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => {
                            const next = { ...builderConfig };
                            next.steps[sIdx].items[iIdx].name = e.target.value;
                            setBuilderConfig(next);
                          }}
                          className="flex-1 min-w-0 bg-transparent text-xs font-semibold focus:outline-none"
                        />
                        {step.id === 'adicionais' && (
                          <input
                            type="number"
                            step="0.5"
                            value={item.price}
                            onChange={(e) => {
                              const next = { ...builderConfig };
                              next.steps[sIdx].items[iIdx].price = Number(e.target.value);
                              setBuilderConfig(next);
                            }}
                            className="w-16 rounded-lg bg-[#4A1259] px-2 py-1 text-xs text-right tabular-nums"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ================= TAB 4: REPORTS (OWNER) ================= */}
          {activeTab === 'reports' && isOwner && reports && (
            <div className="space-y-6 max-w-6xl">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-5 rounded-3xl bg-[#4A1259] border border-[#62207A] space-y-1">
                  <div className="text-xs font-bold text-[#FFF4DC]/70">Faturamento de hoje</div>
                  <div className="font-display text-3xl font-extrabold text-[#F7B518]">
                    <CountUpBRL value={reports.todayRevenue} />
                  </div>
                  <div className="text-xs text-[#FFF4DC]/65">
                    Ontem: R$ {formatBRL(reports.yesterdayRevenue)}
                  </div>
                </div>

                <div className="p-5 rounded-3xl bg-[#4A1259] border border-[#62207A] space-y-1">
                  <div className="text-xs font-bold text-[#FFF4DC]/70">Pedidos hoje</div>
                  <div className="font-display text-3xl font-extrabold text-[#3DDC84] tabular-nums">
                    {reports.todayCount}
                  </div>
                  <div className="text-xs text-[#FFF4DC]/65">Ontem: {reports.yesterdayCount}</div>
                </div>

                <div className="p-5 rounded-3xl bg-[#4A1259] border border-[#62207A] space-y-1">
                  <div className="text-xs font-bold text-[#FFF4DC]/70">Ticket médio</div>
                  <div className="font-display text-3xl font-extrabold text-[#FFF4DC]">
                    <CountUpBRL value={reports.averageTicket} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="p-5 rounded-3xl bg-[#4A1259] border border-[#62207A] space-y-4">
                  <h2 className="font-display text-lg font-bold text-[#F7B518]">
                    Itens mais pedidos hoje
                  </h2>
                  {reports.topItems.length === 0 ? (
                    <p className="text-sm text-[#FFF4DC]/60">Nenhum pedido registrado hoje ainda.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {reports.topItems.map((item) => (
                        <div key={item.name} className="flex justify-between text-sm">
                          <span className="font-semibold">
                            {item.quantity}x {item.name}
                          </span>
                          <span className="font-bold text-[#F7B518] tabular-nums">
                            R$ {formatBRL(item.revenue)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-5 rounded-3xl bg-[#4A1259] border border-[#62207A] space-y-4">
                  <h2 className="font-display text-lg font-bold text-[#F7B518]">
                    Por forma de pagamento
                  </h2>
                  <div className="space-y-3">
                    {reports.byPayment.map((p) => (
                      <div key={p.method} className="flex items-center justify-between text-sm">
                        <span className="font-bold uppercase">
                          {p.method === 'pix' ? 'Pix' : p.method === 'card' ? 'Cartão' : 'Dinheiro'} (
                          {p.count})
                        </span>
                        <span className="font-bold text-[#F7B518] tabular-nums">
                          R$ {formatBRL(p.total)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Hourly Chart */}
              <div className="p-5 rounded-3xl bg-[#4A1259] border border-[#62207A] space-y-4">
                <h2 className="font-display text-lg font-bold text-[#F7B518]">
                  Movimento por hora (12h - 23h)
                </h2>
                <div className="h-44 flex items-end gap-2">
                  {(() => {
                    const maxRev = Math.max(1, ...reports.byHour.map((h) => h.revenue));
                    return reports.byHour.map((h) => (
                      <div key={h.hour} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                        <div
                          title={`${h.hour}: ${h.count} pedido(s) · R$ ${formatBRL(h.revenue)}`}
                          className="w-full rounded-t-xl bg-gradient-to-t from-[#F7B518] to-[#FFD45C] transition-all min-h-[4px]"
                          style={{ height: `${Math.max(4, (h.revenue / maxRev) * 100)}%` }}
                        />
                        <span className="text-[10px] text-[#FFF4DC]/70 tabular-nums">{h.hour}</span>
                      </div>
                    ));
                  })()}
                </div>
              </div>

              {/* Permanent Complete Order History */}
              <div className="p-5 rounded-3xl bg-[#4A1259] border border-[#62207A] space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-lg font-bold text-[#F7B518]">
                    Histórico permanente de pedidos ({orders.length})
                  </h2>
                  <span className="text-xs text-[#FFF4DC]/70">
                    Todos os pedidos ficam salvos para sempre
                  </span>
                </div>
                {orders.length === 0 ? (
                  <p className="text-sm text-[#FFF4DC]/60">Nenhum pedido registrado ainda.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#62207A] text-[#F7B518]">
                          <th className="py-2 pr-3">Pedido</th>
                          <th className="py-2 pr-3">Data / Hora</th>
                          <th className="py-2 pr-3">Cliente</th>
                          <th className="py-2 pr-3">Pagamento</th>
                          <th className="py-2 pr-3">Status</th>
                          <th className="py-2 pr-3 text-right">Total</th>
                          <th className="py-2 text-right">Cupom</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#62207A]/50">
                        {orders.map((ord) => (
                          <tr key={ord.id} className="hover:bg-[#2E0A3A]/40">
                            <td className="py-2.5 pr-3 font-extrabold text-[#F7B518]">
                              #{ord.orderNumber}
                            </td>
                            <td className="py-2.5 pr-3 tabular-nums text-[#FFF4DC]/80">
                              {new Date(ord.createdAt).toLocaleString('pt-BR', {
                                day: '2-digit',
                                month: '2-digit',
                                year: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                            <td className="py-2.5 pr-3 font-bold">{ord.customerName}</td>
                            <td className="py-2.5 pr-3 uppercase">{ord.paymentMethod}</td>
                            <td className="py-2.5 pr-3">
                              <span className="px-2 py-0.5 rounded-full bg-[#2E0A3A] text-[10px] font-bold">
                                {ord.status}
                              </span>
                            </td>
                            <td className="py-2.5 pr-3 text-right font-bold tabular-nums text-[#3DDC84]">
                              R$ {formatBRL(ord.total)}
                            </td>
                            <td className="py-2.5 text-right">
                              <button
                                type="button"
                                onClick={() => handlePrintThermal(ord)}
                                className="p-1.5 rounded-lg bg-[#2E0A3A] hover:bg-[#62207A] cursor-pointer"
                                title="Imprimir"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================= TAB 5: SETTINGS ================= */}
          {activeTab === 'settings' && settings && (
            <div className="space-y-6 max-w-4xl">
              {/* Manual Open/Close (Both Owner & Attendant) */}
              <div className="p-5 rounded-3xl bg-[#4A1259] border border-[#62207A] space-y-3">
                <h2 className="font-display text-lg font-bold text-[#F7B518]">
                  Controle rápido de abertura da loja
                </h2>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'auto' as const, label: 'Seguir horário automático' },
                    { id: 'open' as const, label: 'Forçar ABERTA agora' },
                    { id: 'closed' as const, label: 'Forçar FECHADA agora' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleToggleStoreOpen(opt.id)}
                      className={`min-h-[42px] px-4 rounded-full text-xs font-bold cursor-pointer ${
                        settings.manualOpenOverride === opt.id
                          ? 'bg-[#F7B518] text-[#2E0A3A]'
                          : 'bg-[#2E0A3A] text-[#FFF4DC]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {isOwner && (
                <>
                  {/* Delivery, Pix, Contact */}
                  <div className="p-5 rounded-3xl bg-[#4A1259] border border-[#62207A] space-y-4">
                    <h2 className="font-display text-lg font-bold text-[#F7B518]">
                      Dados da loja, Entrega e Pix
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                      <label>
                        Taxa de entrega fixa (R$)
                        <input
                          type="number"
                          step="0.5"
                          value={settings.deliveryFee}
                          onChange={(e) =>
                            setSettings({ ...settings, deliveryFee: Number(e.target.value) })
                          }
                          className="w-full mt-1 rounded-xl bg-[#2E0A3A] border border-[#62207A] px-3 py-2"
                        />
                      </label>
                      <label>
                        Tempo estimado de entrega
                        <input
                          type="text"
                          value={settings.estimatedTime}
                          onChange={(e) => setSettings({ ...settings, estimatedTime: e.target.value })}
                          className="w-full mt-1 rounded-xl bg-[#2E0A3A] border border-[#62207A] px-3 py-2"
                        />
                      </label>
                      <label className="sm:col-span-2">
                        Endereço da loja (retirada no balcão)
                        <input
                          type="text"
                          value={settings.pickupAddress}
                          onChange={(e) => setSettings({ ...settings, pickupAddress: e.target.value })}
                          className="w-full mt-1 rounded-xl bg-[#2E0A3A] border border-[#62207A] px-3 py-2"
                        />
                      </label>
                      <label>
                        Chave Pix (formato exibido)
                        <input
                          type="text"
                          value={settings.pixKeyDisplay}
                          onChange={(e) => setSettings({ ...settings, pixKeyDisplay: e.target.value })}
                          className="w-full mt-1 rounded-xl bg-[#2E0A3A] border border-[#62207A] px-3 py-2"
                        />
                      </label>
                      <label>
                        Chave Pix (EMV Copia e Cola)
                        <input
                          type="text"
                          value={settings.pixKey}
                          onChange={(e) => setSettings({ ...settings, pixKey: e.target.value })}
                          className="w-full mt-1 rounded-xl bg-[#2E0A3A] border border-[#62207A] px-3 py-2"
                        />
                      </label>
                      <label>
                        Nome do recebedor Pix
                        <input
                          type="text"
                          value={settings.pixReceiverName}
                          onChange={(e) =>
                            setSettings({ ...settings, pixReceiverName: e.target.value })
                          }
                          className="w-full mt-1 rounded-xl bg-[#2E0A3A] border border-[#62207A] px-3 py-2"
                        />
                      </label>
                      <label>
                        Cidade do recebedor Pix
                        <input
                          type="text"
                          value={settings.pixReceiverCity}
                          onChange={(e) =>
                            setSettings({ ...settings, pixReceiverCity: e.target.value })
                          }
                          className="w-full mt-1 rounded-xl bg-[#2E0A3A] border border-[#62207A] px-3 py-2"
                        />
                      </label>
                    </div>
                  </div>

                  {/* Brand Media Uploads */}
                  <div className="p-5 rounded-3xl bg-[#4A1259] border border-[#62207A] space-y-4">
                    <h2 className="font-display text-lg font-bold text-[#F7B518]">
                      Logo, Foto do Hero, Vídeo e Nossa Casa
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                      <label className="p-3 rounded-2xl bg-[#2E0A3A] border border-[#62207A] cursor-pointer space-y-2">
                        <div className="font-bold">Logo da loja</div>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (f) {
                              const url = await handleFileUpload(f);
                              if (url) setSettings({ ...settings, logoUrl: url });
                            }
                          }}
                        />
                        <div className="text-[#F7B518] underline">Trocar logo</div>
                      </label>

                      <label className="p-3 rounded-2xl bg-[#2E0A3A] border border-[#62207A] cursor-pointer space-y-2">
                        <div className="font-bold">Foto tigela principal (Hero)</div>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (f) {
                              const url = await handleFileUpload(f);
                              if (url) setSettings({ ...settings, heroBowlUrl: url });
                            }
                          }}
                        />
                        <div className="text-[#F7B518] underline">
                          {settings.heroBowlUrl ? 'Substituir foto' : 'Enviar foto real'}
                        </div>
                      </label>

                      <label className="p-3 rounded-2xl bg-[#2E0A3A] border border-[#62207A] cursor-pointer space-y-2">
                        <div className="font-bold">Vídeo curto de fundo (Hero)</div>
                        <input
                          type="file"
                          accept="video/mp4,video/webm"
                          className="hidden"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (f) {
                              const url = await handleFileUpload(f);
                              if (url) setSettings({ ...settings, heroVideoUrl: url });
                            }
                          }}
                        />
                        <div className="text-[#F7B518] underline">
                          {settings.heroVideoUrl ? 'Substituir vídeo' : 'Enviar vídeo MP4'}
                        </div>
                      </label>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold">Fotos da loja e equipe (Nossa casa)</span>
                        <label className="px-3 py-1.5 rounded-full bg-[#2E0A3A] text-xs font-bold text-[#F7B518] cursor-pointer">
                          + Adicionar foto
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              if (f) {
                                const url = await handleFileUpload(f);
                                if (url) {
                                  setSettings({
                                    ...settings,
                                    teamPhotos: [
                                      ...(settings.teamPhotos || []),
                                      { id: `team-${Date.now()}`, url, caption: 'Equipe Tropicália Açaí' },
                                    ],
                                  });
                                }
                              }
                            }}
                          />
                        </label>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(settings.teamPhotos || []).map((tp) => (
                          <div key={tp.id} className="relative w-20 h-20 rounded-xl overflow-hidden">
                            <img src={tp.url} alt="" className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() =>
                                setSettings({
                                  ...settings,
                                  teamPhotos: settings.teamPhotos.filter((x) => x.id !== tp.id),
                                })
                              }
                              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Opening Hours */}
                  <div className="p-5 rounded-3xl bg-[#4A1259] border border-[#62207A] space-y-3">
                    <h2 className="font-display text-lg font-bold text-[#F7B518]">
                      Horários automáticos por dia
                    </h2>
                    <div className="space-y-2">
                      {DAY_LABELS.map((dayName, idx) => {
                        const row = settings.openingHours[idx] || { enabled: true, open: '14:00', close: '23:00' };
                        return (
                          <div key={dayName} className="flex flex-wrap items-center gap-3 text-xs bg-[#2E0A3A] p-2.5 rounded-xl">
                            <label className="w-28 flex items-center gap-2 font-bold">
                              <input
                                type="checkbox"
                                checked={row.enabled}
                                onChange={(e) =>
                                  setSettings({
                                    ...settings,
                                    openingHours: {
                                      ...settings.openingHours,
                                      [idx]: { ...row, enabled: e.target.checked },
                                    },
                                  })
                                }
                                className="accent-[#F7B518]"
                              />
                              {dayName}
                            </label>
                            <input
                              type="time"
                              value={row.open}
                              onChange={(e) =>
                                setSettings({
                                  ...settings,
                                  openingHours: {
                                    ...settings.openingHours,
                                    [idx]: { ...row, open: e.target.value },
                                  },
                                })
                              }
                              className="rounded-lg bg-[#4A1259] px-2 py-1"
                            />
                            <span>até</span>
                            <input
                              type="time"
                              value={row.close}
                              onChange={(e) =>
                                setSettings({
                                  ...settings,
                                  openingHours: {
                                    ...settings.openingHours,
                                    [idx]: { ...row, close: e.target.value },
                                  },
                                })
                              }
                              className="rounded-lg bg-[#4A1259] px-2 py-1"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSaveSettings(settings)}
                    className="min-h-[48px] px-8 rounded-full bg-[#F7B518] hover:bg-[#FFD45C] text-[#2E0A3A] font-display font-extrabold text-base cursor-pointer"
                  >
                    Salvar todas as configurações
                  </button>

                  {/* Staff Users Management */}
                  <div className="p-5 rounded-3xl bg-[#4A1259] border border-[#62207A] space-y-4">
                    <div className="flex items-center gap-2 font-display text-lg font-bold text-[#F7B518]">
                      <Users className="w-5 h-5" />
                      Usuários do painel (Dono e Atendentes)
                    </div>
                    <div className="space-y-2">
                      {staffUsers.map((u) => (
                        <div
                          key={u.id}
                          className="p-3 rounded-2xl bg-[#2E0A3A] flex flex-wrap items-center justify-between gap-2 text-xs"
                        >
                          <div>
                            <div className="font-bold text-sm">{u.name}</div>
                            <div className="text-[#FFF4DC]/70">
                              {u.email} · {u.role === 'owner' ? 'DONO' : 'ATENDENTE'}
                            </div>
                          </div>
                          {u.id !== staffUser.id && (
                            <button
                              type="button"
                              onClick={async () => {
                                await apiFetch(`/api/admin/users/${u.id}`, { method: 'DELETE' });
                                loadOwnerExtras();
                                notify('Usuário removido.');
                              }}
                              className="px-3 py-1 rounded-full bg-[#FF6B5E]/20 text-[#FF6B5E] font-bold cursor-pointer"
                            >
                              Remover
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-2 border-t border-[#62207A]">
                      <input
                        type="text"
                        placeholder="Nome"
                        value={newUserForm.name}
                        onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
                        className="rounded-xl bg-[#2E0A3A] px-3 py-2 text-xs"
                      />
                      <input
                        type="email"
                        placeholder="E-mail"
                        value={newUserForm.email}
                        onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                        className="rounded-xl bg-[#2E0A3A] px-3 py-2 text-xs"
                      />
                      <input
                        type="password"
                        placeholder="Senha (mín 6)"
                        value={newUserForm.password}
                        onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                        className="rounded-xl bg-[#2E0A3A] px-3 py-2 text-xs"
                      />
                      <div className="flex gap-2">
                        <select
                          value={newUserForm.role}
                          onChange={(e) =>
                            setNewUserForm({ ...newUserForm, role: e.target.value as StaffRole })
                          }
                          className="flex-1 rounded-xl bg-[#2E0A3A] px-2 py-2 text-xs"
                        >
                          <option value="attendant">Atendente</option>
                          <option value="owner">Dono</option>
                        </select>
                        <button
                          type="button"
                          onClick={async () => {
                            const res = await apiFetch('/api/admin/users', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify(newUserForm),
                            });
                            if (res.ok) {
                              setNewUserForm({ name: '', email: '', password: '', role: 'attendant' });
                              loadOwnerExtras();
                              notify('Usuário criado!');
                            } else {
                              const err = await res.json();
                              notify(err.error || 'Erro ao criar usuário.');
                            }
                          }}
                          className="px-3 rounded-xl bg-[#F7B518] text-[#2E0A3A] font-bold text-xs cursor-pointer"
                        >
                          Criar
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#4A1259] border-t border-[#62207A] flex items-center justify-around py-1.5">
        {visibleNav.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveTab(item.id)}
            className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-[10px] font-bold cursor-pointer ${
              activeTab === item.id ? 'text-[#F7B518]' : 'text-[#FFF4DC]/70'
            }`}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* PIX RECEIPT VIEWER MODAL */}
      {receiptModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-[#2E0A3A] border border-[#62207A] overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-5 py-3 bg-[#4A1259] flex items-center justify-between">
              <div className="font-display font-bold">
                Comprovante · Pedido #{receiptModalOrder.orderNumber} (R${' '}
                {formatBRL(receiptModalOrder.total)})
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setReceiptZoom((z) => Math.max(0.75, z - 0.25))}
                  className="p-2 rounded-full bg-[#2E0A3A] cursor-pointer"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setReceiptZoom((z) => Math.min(2.5, z + 0.25))}
                  className="p-2 rounded-full bg-[#2E0A3A] cursor-pointer"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setReceiptModalOrder(null)}
                  className="p-2 rounded-full bg-[#2E0A3A] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-black/40">
              {receiptModalOrder.pixReceiptUrl?.toLowerCase().endsWith('.pdf') ? (
                <div className="w-full h-[65vh] flex flex-col items-center gap-3">
                  <iframe
                    src={receiptModalOrder.pixReceiptUrl}
                    className="w-full flex-1 rounded-xl bg-white"
                    title="Comprovante PDF"
                  />
                  <a
                    href={receiptModalOrder.pixReceiptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-xs text-[#F7B518] underline"
                  >
                    <FileText className="w-4 h-4" />
                    Abrir PDF em nova aba
                  </a>
                </div>
              ) : (
                <img
                  src={receiptModalOrder.pixReceiptUrl || ''}
                  alt="Comprovante Pix"
                  style={{ transform: `scale(${receiptZoom})` }}
                  className="max-w-full max-h-[68vh] object-contain transition-transform origin-center rounded-xl"
                />
              )}
            </div>

            {!receiptModalOrder.pixConfirmed && (
              <div className="p-4 bg-[#4A1259] border-t border-[#62207A] flex justify-end">
                <button
                  type="button"
                  onClick={() => handleConfirmPix(receiptModalOrder)}
                  className="min-h-[44px] px-6 rounded-full bg-[#3DDC84] text-[#2E0A3A] font-display font-extrabold text-sm flex items-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Confirmar pagamento e iniciar preparo
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* REJECT ORDER MODAL */}
      {rejectModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-3xl bg-[#2E0A3A] border border-[#62207A] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-extrabold flex items-center gap-2">
                <XCircle className="w-5 h-5 text-[#FF6B5E]" />
                Recusar pedido #{rejectModalOrder.orderNumber}
              </h3>
              <button
                type="button"
                onClick={() => setRejectModalOrder(null)}
                className="p-1.5 rounded-full bg-[#4A1259] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_REJECT_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRejectReason(r)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer ${
                    rejectReason === r ? 'bg-[#F7B518] text-[#2E0A3A]' : 'bg-[#4A1259]'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <textarea
              rows={2}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full rounded-2xl bg-[#4A1259] border border-[#62207A] p-3 text-sm"
            />
            <button
              type="button"
              onClick={async () => {
                await handleUpdateOrderStatus(rejectModalOrder, 'cancelled', rejectReason);
                setRejectModalOrder(null);
              }}
              className="w-full min-h-[44px] rounded-full bg-[#FF6B5E] text-white font-display font-bold text-sm cursor-pointer"
            >
              Confirmar recusa
            </button>
          </div>
        </div>
      )}

      {/* PRODUCT EDITOR MODAL (OWNER) */}
      {editingProduct && isOwner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-[#2E0A3A] border border-[#62207A] p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl font-extrabold">
                {editingProduct.id ? 'Editar produto' : 'Novo produto'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="p-2 rounded-full bg-[#4A1259] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <label className="block">
                Nome do produto
                <input
                  type="text"
                  value={editingProduct.name || ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                  className="w-full mt-1 rounded-xl bg-[#4A1259] border border-[#62207A] px-3 py-2"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  Categoria
                  <select
                    value={editingProduct.categoryId || ''}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, categoryId: e.target.value })
                    }
                    className="w-full mt-1 rounded-xl bg-[#4A1259] border border-[#62207A] px-3 py-2"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  Preço (R$)
                  <input
                    type="number"
                    step="0.01"
                    value={editingProduct.price ?? 0}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, price: Number(e.target.value) })
                    }
                    className="w-full mt-1 rounded-xl bg-[#4A1259] border border-[#62207A] px-3 py-2"
                  />
                </label>
              </div>

              <label className="block">
                Descrição
                <textarea
                  rows={2}
                  value={editingProduct.description || ''}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, description: e.target.value })
                  }
                  className="w-full mt-1 rounded-xl bg-[#4A1259] border border-[#62207A] px-3 py-2"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  Selo (Badge)
                  <select
                    value={editingProduct.badge || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, badge: e.target.value })}
                    className="w-full mt-1 rounded-xl bg-[#4A1259] border border-[#62207A] px-3 py-2"
                  >
                    <option value="">Sem selo</option>
                    <option value="NOVO">NOVO</option>
                    <option value="MAIS PEDIDO">MAIS PEDIDO</option>
                    <option value="PROMO">PROMO</option>
                    <option value="OFERTA ESPECIAL">OFERTA ESPECIAL</option>
                  </select>
                </label>

                <label className="block">
                  Foto real do produto
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        const url = await handleFileUpload(f);
                        if (url) setEditingProduct({ ...editingProduct, imageUrl: url });
                      }
                    }}
                    className="w-full mt-1 text-xs"
                  />
                </label>
              </div>

              {editingProduct.imageUrl && (
                <img
                  src={editingProduct.imageUrl}
                  alt="Preview"
                  className="w-24 h-24 rounded-2xl object-cover border border-[#F7B518]"
                />
              )}
            </div>

            <button
              type="button"
              onClick={async () => {
                const isEdit = Boolean(editingProduct.id);
                const res = await apiFetch(
                  isEdit ? `/api/admin/products/${editingProduct.id}` : '/api/admin/products',
                  {
                    method: isEdit ? 'PUT' : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(editingProduct),
                  }
                );
                if (res.ok) {
                  setProducts(await res.json());
                  setEditingProduct(null);
                  notify('Produto salvo e atualizado no cardápio!');
                }
              }}
              className="w-full min-h-[46px] rounded-full bg-[#F7B518] text-[#2E0A3A] font-display font-extrabold text-sm cursor-pointer"
            >
              Salvar produto
            </button>
          </div>
        </div>
      )}

      {/* CATEGORY EDITOR MODAL (OWNER) */}
      {editingCategory && isOwner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-3xl bg-[#2E0A3A] border border-[#62207A] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-extrabold">Nova categoria</h3>
              <button
                type="button"
                onClick={() => setEditingCategory(null)}
                className="p-2 rounded-full bg-[#4A1259] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              type="text"
              placeholder="Nome da categoria"
              value={editingCategory.name || ''}
              onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
              className="w-full rounded-xl bg-[#4A1259] border border-[#62207A] px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="Subtítulo curto"
              value={editingCategory.subtitle || ''}
              onChange={(e) => setEditingCategory({ ...editingCategory, subtitle: e.target.value })}
              className="w-full rounded-xl bg-[#4A1259] border border-[#62207A] px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={async () => {
                const res = await apiFetch('/api/admin/categories', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(editingCategory),
                });
                if (res.ok) {
                  setCategories(await res.json());
                  setEditingCategory(null);
                  notify('Categoria criada!');
                }
              }}
              className="w-full min-h-[44px] rounded-full bg-[#F7B518] text-[#2E0A3A] font-display font-bold text-sm cursor-pointer"
            >
              Criar categoria
            </button>
          </div>
        </div>
      )}

      {/* HIDDEN THERMAL 80MM RECEIPT FOR PRINTING */}
      {printOrder && (
        <div id="thermal-receipt" className="hidden print:block text-black bg-white font-mono text-xs">
          <div className="text-center font-bold text-sm border-b border-black pb-1 mb-2">
            TROPICÁLIA AÇAÍ — COZINHA
          </div>
          <div>Pedido: #{printOrder.orderNumber}</div>
          <div>
            Data: {new Date(printOrder.createdAt).toLocaleString('pt-BR')}
          </div>
          <div>Cliente: {printOrder.customerName}</div>
          <div>WhatsApp: {printOrder.customerWhatsapp}</div>
          <div>
            Tipo: {printOrder.deliveryType === 'delivery' ? 'ENTREGA' : 'RETIRADA NO BALCÃO'}
          </div>
          {printOrder.deliveryType === 'delivery' && printOrder.address && (
            <div>
              End: {printOrder.address.street}, {printOrder.address.number} -{' '}
              {printOrder.address.neighborhood}
            </div>
          )}
          <div className="border-t border-b border-black my-2 py-1 space-y-1">
            {printOrder.items.map((item) => (
              <div key={item.id}>
                <div className="font-bold">
                  {item.quantity}x {item.name} — R$ {formatBRL(item.unitPrice * item.quantity)}
                </div>
                {item.selections.map((s, idx) => (
                  <div key={idx} className="pl-2">
                    {s.groupTitle}: {s.items.map((i) => i.name).join(', ')}
                  </div>
                ))}
                {item.notes && <div className="pl-2 font-bold">OBS: {item.notes}</div>}
              </div>
            ))}
          </div>
          <div>Pagamento: {printOrder.paymentMethod.toUpperCase()}</div>
          {printOrder.cashChangeFor && (
            <div>Troco para: R$ {formatBRL(printOrder.cashChangeFor)}</div>
          )}
          <div className="font-bold text-sm mt-1">TOTAL: R$ {formatBRL(printOrder.total)}</div>
        </div>
      )}
    </div>
  );
};
