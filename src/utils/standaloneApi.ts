import {
  DEFAULT_BUILDER_CONFIG,
  DEFAULT_CATEGORIES,
  DEFAULT_PRODUCTS,
  DEFAULT_SETTINGS,
} from '../data/seedCatalog';
import {
  AdminReports,
  BuilderConfig,
  CartItem,
  MenuCategory,
  Order,
  OrderStatus,
  PaymentMethod,
  Product,
  StaffRole,
  StaffUser,
  StoreSettings,
} from '../types';
import { computeStoreOpen, generatePixPayload, normalizePhone } from './format';

const STORAGE_KEY = 'tropicalia_standalone_db_v1';

interface StoredStaffUser extends StaffUser {
  password: string;
}

interface StandaloneDB {
  settings: StoreSettings;
  categories: MenuCategory[];
  products: Product[];
  builderConfig: BuilderConfig;
  orders: Array<{ order: Order; customerToken: string }>;
  staffUsers: StoredStaffUser[];
  sessions: Array<{ token: string; userId: string }>;
  nextOrderNum: number;
}

const syncChannel =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('tropicalia_sync') : null;

export function emitLocalSync(msg: { type: string; data: unknown; customerToken?: string }) {
  try {
    syncChannel?.postMessage(msg);
    window.dispatchEvent(new CustomEvent('tropicalia:sync', { detail: msg }));
  } catch {
    // ignore
  }
}

export function subscribeLocalSync(
  handler: (msg: { type: string; data: unknown; customerToken?: string }) => void
): () => void {
  const onChannel = (ev: MessageEvent) => {
    if (ev.data) handler(ev.data);
  };
  const onCustom = (ev: Event) => {
    const ce = ev as CustomEvent;
    if (ce.detail) handler(ce.detail);
  };
  syncChannel?.addEventListener('message', onChannel);
  window.addEventListener('tropicalia:sync', onCustom);
  return () => {
    syncChannel?.removeEventListener('message', onChannel);
    window.removeEventListener('tropicalia:sync', onCustom);
  };
}

function createInitialDB(): StandaloneDB {
  const now = new Date().toISOString();
  return {
    settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
    categories: JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)),
    products: JSON.parse(JSON.stringify(DEFAULT_PRODUCTS)),
    builderConfig: JSON.parse(JSON.stringify(DEFAULT_BUILDER_CONFIG)),
    orders: [],
    staffUsers: [
      {
        id: 'staff-owner-tropicalia',
        name: 'Tropicália',
        email: 'tropicalia@gmail.com',
        password: 'melhor2027',
        role: 'owner',
        active: true,
        createdAt: now,
      },
    ],
    sessions: [],
    nextOrderNum: 101,
  };
}

function loadDB(): StandaloneDB {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StandaloneDB;
      if (parsed && parsed.settings && Array.isArray(parsed.categories) && Array.isArray(parsed.products)) {
        // Migrate away from legacy default accounts if present
        const hadLegacy = parsed.staffUsers?.some(
          (u) => u.id === 'staff-owner-1' || u.id === 'staff-attendant-1'
        );
        if (hadLegacy) {
          parsed.sessions = (parsed.sessions || []).filter(
            (s) => s.userId !== 'staff-owner-1' && s.userId !== 'staff-attendant-1'
          );
          parsed.staffUsers = (parsed.staffUsers || []).filter(
            (u) => u.id !== 'staff-owner-1' && u.id !== 'staff-attendant-1'
          );
        }
        const hasOwner = (parsed.staffUsers || []).some((u) => u.role === 'owner' && u.active);
        if (!hasOwner) {
          parsed.staffUsers = [
            ...(parsed.staffUsers || []),
            {
              id: 'staff-owner-tropicalia',
              name: 'Tropicália',
              email: 'tropicalia@gmail.com',
              password: 'melhor2027',
              role: 'owner',
              active: true,
              createdAt: new Date().toISOString(),
            },
          ];
        }
        if (!localStorage.getItem('tropicalia_migrated_hours_10_23')) {
          parsed.settings.openingHours = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.openingHours));
          localStorage.setItem('tropicalia_migrated_hours_10_23', '1');
          saveDB(parsed);
        }
        if (hadLegacy || !hasOwner) {
          saveDB(parsed);
        }
        return parsed;
      }
    }
  } catch {
    // ignore corrupt storage
  }
  const initial = createInitialDB();
  saveDB(initial);
  return initial;
}

function saveDB(db: StandaloneDB) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // ignore storage quota errors
  }
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function parseBody(init?: RequestInit): Record<string, unknown> {
  if (!init?.body || typeof init.body !== 'string') return {};
  try {
    return JSON.parse(init.body) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function getHeader(headers: HeadersInit | undefined, name: string): string {
  if (!headers) return '';
  if (headers instanceof Headers) return headers.get(name) || '';
  if (Array.isArray(headers)) {
    const found = headers.find(([k]) => k.toLowerCase() === name.toLowerCase());
    return found ? found[1] : '';
  }
  const record = headers as Record<string, string>;
  const key = Object.keys(record).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? record[key] : '';
}

function getAuthedUser(db: StandaloneDB, init?: RequestInit): StoredStaffUser | null {
  const auth = getHeader(init?.headers, 'Authorization');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return null;
  const session = db.sessions.find((s) => s.token === token);
  if (!session) return null;
  const user = db.staffUsers.find((u) => u.id === session.userId && u.active);
  return user || null;
}

function toPublicUser(u: StoredStaffUser): StaffUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active,
    createdAt: u.createdAt,
  };
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      if (!file.type.startsWith('image/') || result.length < 350_000) {
        resolve(result);
        return;
      }
      const img = new Image();
      img.onload = () => {
        const maxSide = 900;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(result);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => resolve(result);
      img.src = result;
    };
    reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
    reader.readAsDataURL(file);
  });
}

function buildCatalogPayload(db: StandaloneDB) {
  const categories = [...db.categories].sort((a, b) => a.sortOrder - b.sortOrder);
  const products = [...db.products].sort((a, b) => a.sortOrder - b.sortOrder);
  return {
    settings: db.settings,
    categories,
    products,
    builderConfig: db.builderConfig,
    isOpenNow: computeStoreOpen(db.settings),
  };
}

export async function handleStandaloneRequest(rawUrl: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method || 'GET').toUpperCase();
  const parsed = new URL(rawUrl, window.location.origin);
  const pathname = parsed.pathname;
  const db = loadDB();

  // PUBLIC: Catalog
  if (method === 'GET' && pathname === '/api/store/catalog') {
    return jsonResponse(buildCatalogPayload(db));
  }

  // PUBLIC: Create Order
  if (method === 'POST' && pathname === '/api/orders') {
    if (!computeStoreOpen(db.settings)) {
      return jsonResponse(
        { error: 'A loja está fechada no momento. Confira o horário de funcionamento.' },
        400
      );
    }
    const body = parseBody(init) as {
      customerName?: string;
      customerWhatsapp?: string;
      customerToken?: string;
      deliveryType?: 'delivery' | 'pickup';
      address?: Order['address'];
      paymentMethod?: PaymentMethod;
      cashChangeFor?: number | null;
      items?: CartItem[];
    };

    if (!body.customerName?.trim() || normalizePhone(body.customerWhatsapp || '').length < 10) {
      return jsonResponse({ error: 'Informe seu nome completo e um WhatsApp válido com DDD.' }, 400);
    }
    if (!body.customerToken || body.customerToken.length < 12) {
      return jsonResponse({ error: 'Token de sessão do cliente inválido.' }, 400);
    }
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return jsonResponse({ error: 'Seu carrinho está vazio.' }, 400);
    }
    if (
      body.deliveryType === 'delivery' &&
      (!body.address?.street?.trim() || !body.address?.number?.trim() || !body.address?.neighborhood?.trim())
    ) {
      return jsonResponse({ error: 'Preencha rua, número e bairro para a entrega.' }, 400);
    }

    const subtotal = Number(
      body.items.reduce((acc, i) => acc + Number(i.unitPrice) * Number(i.quantity), 0).toFixed(2)
    );
    const deliveryFee = body.deliveryType === 'delivery' ? Number(db.settings.deliveryFee) : 0;
    const total = Number((subtotal + deliveryFee).toFixed(2));
    const orderNumber = db.nextOrderNum++;
    const now = new Date().toISOString();
    const paymentMethod = body.paymentMethod || 'pix';
    const initialStatus: OrderStatus = paymentMethod === 'pix' ? 'awaiting_payment' : 'pending';
    const pixCode =
      paymentMethod === 'pix'
        ? generatePixPayload({
            pixKey: db.settings.pixKey,
            receiverName: db.settings.pixReceiverName,
            receiverCity: db.settings.pixReceiverCity,
            amount: total,
            txId: `TROP${orderNumber}`,
          })
        : null;

    const order: Order = {
      id: `ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      orderNumber,
      customerName: body.customerName.trim(),
      customerWhatsapp: normalizePhone(body.customerWhatsapp || ''),
      deliveryType: body.deliveryType || 'delivery',
      address: body.deliveryType === 'delivery' ? body.address || null : null,
      paymentMethod,
      cashChangeFor: paymentMethod === 'cash' ? body.cashChangeFor ?? null : null,
      pixCode,
      pixReceiptUrl: null,
      pixReceiptName: null,
      pixConfirmed: false,
      items: body.items,
      subtotal,
      deliveryFee,
      total,
      status: initialStatus,
      cancelReason: null,
      createdAt: now,
      updatedAt: now,
    };

    db.orders.unshift({ order, customerToken: body.customerToken });
    saveDB(db);
    emitLocalSync({ type: 'order:created', data: order });
    return jsonResponse(order, 201);
  }

  // PUBLIC: My orders
  if (method === 'GET' && pathname === '/api/orders/mine') {
    const token = parsed.searchParams.get('token') || '';
    const whatsapp = normalizePhone(parsed.searchParams.get('whatsapp') || '');
    if (!token || token.length < 12) return jsonResponse([]);
    const list = db.orders
      .filter(
        (entry) =>
          entry.customerToken === token ||
          (whatsapp.length >= 10 && entry.order.customerWhatsapp === whatsapp)
      )
      .map((entry) => entry.order);
    return jsonResponse(list);
  }

  // PUBLIC: Upload receipt
  const receiptMatch = pathname.match(/^\/api\/orders\/([^/]+)\/receipt$/);
  if (method === 'POST' && receiptMatch) {
    const orderId = receiptMatch[1];
    const entry = db.orders.find((o) => o.order.id === orderId);
    if (!entry) return jsonResponse({ error: 'Pedido não encontrado.' }, 404);
    if (!(init?.body instanceof FormData)) {
      return jsonResponse({ error: 'Envie uma foto (JPG/PNG/WEBP) ou arquivo PDF válido.' }, 400);
    }
    const token = String(init.body.get('customerToken') || parsed.searchParams.get('token') || '');
    if (entry.customerToken !== token) {
      return jsonResponse({ error: 'Acesso negado a este pedido.' }, 403);
    }
    const file = init.body.get('receipt');
    if (!(file instanceof File)) {
      return jsonResponse({ error: 'Envie uma foto (JPG/PNG/WEBP) ou arquivo PDF válido.' }, 400);
    }
    const dataUrl = await fileToDataUrl(file);
    entry.order.pixReceiptUrl = dataUrl;
    entry.order.pixReceiptName = file.name;
    if (entry.order.status === 'awaiting_payment') {
      entry.order.status = 'pending';
    }
    entry.order.updatedAt = new Date().toISOString();
    saveDB(db);
    emitLocalSync({ type: 'order:updated', data: entry.order, customerToken: entry.customerToken });
    return jsonResponse(entry.order);
  }

  // AUTH: Login
  if (method === 'POST' && pathname === '/api/auth/login') {
    const body = parseBody(init) as { email?: string; password?: string };
    const email = (body.email || '').trim().toLowerCase();
    const password = body.password || '';
    const user = db.staffUsers.find((u) => u.email.toLowerCase() === email && u.active);
    if (!user || user.password !== password) {
      return jsonResponse({ error: 'E-mail ou senha inválidos. Confira e tente novamente.' }, 401);
    }
    const token = `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    db.sessions.push({ token, userId: user.id });
    saveDB(db);
    return jsonResponse({ token, user: toPublicUser(user) });
  }

  // AUTH: Logout
  if (method === 'POST' && pathname === '/api/auth/logout') {
    const auth = getHeader(init?.headers, 'Authorization');
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    db.sessions = db.sessions.filter((s) => s.token !== token);
    saveDB(db);
    return jsonResponse({ ok: true });
  }

  // AUTH: Me
  if (method === 'GET' && pathname === '/api/auth/me') {
    const user = getAuthedUser(db, init);
    if (!user) return jsonResponse({ error: 'Sessão expirada ou não autenticada.' }, 401);
    return jsonResponse({ user: toPublicUser(user) });
  }

  // PROTECTED: Staff routes
  const authed = getAuthedUser(db, init);
  if (!authed) {
    return jsonResponse({ error: 'Sessão expirada ou não autenticada. Faça login novamente.' }, 401);
  }

  if (method === 'GET' && pathname === '/api/admin/orders') {
    return jsonResponse(db.orders.map((o) => o.order));
  }

  const confirmPixMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)\/confirm-pix$/);
  if (method === 'POST' && confirmPixMatch) {
    const entry = db.orders.find((o) => o.order.id === confirmPixMatch[1]);
    if (!entry) return jsonResponse({ error: 'Pedido não encontrado.' }, 404);
    entry.order.pixConfirmed = true;
    if (entry.order.status === 'awaiting_payment' || entry.order.status === 'pending') {
      entry.order.status = 'preparing';
    }
    entry.order.updatedAt = new Date().toISOString();
    saveDB(db);
    emitLocalSync({ type: 'order:updated', data: entry.order, customerToken: entry.customerToken });
    return jsonResponse(entry.order);
  }

  const statusMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)\/status$/);
  if (method === 'PATCH' && statusMatch) {
    const entry = db.orders.find((o) => o.order.id === statusMatch[1]);
    if (!entry) return jsonResponse({ error: 'Pedido não encontrado.' }, 404);
    const body = parseBody(init) as { status: OrderStatus; cancelReason?: string };
    if (
      entry.order.paymentMethod === 'pix' &&
      !entry.order.pixConfirmed &&
      ['preparing', 'ready', 'out_for_delivery', 'delivered'].includes(body.status)
    ) {
      return jsonResponse(
        { error: 'Confirme o pagamento do Pix antes de iniciar o preparo deste pedido.' },
        400
      );
    }
    entry.order.status = body.status;
    if (body.status === 'cancelled') {
      entry.order.cancelReason = body.cancelReason || 'Pedido recusado pela loja.';
    }
    entry.order.updatedAt = new Date().toISOString();
    saveDB(db);
    emitLocalSync({ type: 'order:updated', data: entry.order, customerToken: entry.customerToken });
    return jsonResponse(entry.order);
  }

  const availMatch = pathname.match(/^\/api\/admin\/products\/([^/]+)\/availability$/);
  if (method === 'PATCH' && availMatch) {
    const prod = db.products.find((p) => p.id === availMatch[1]);
    if (!prod) return jsonResponse({ error: 'Produto não encontrado.' }, 404);
    const body = parseBody(init) as { available?: boolean };
    prod.available = Boolean(body.available);
    saveDB(db);
    emitLocalSync({ type: 'catalog:updated', data: buildCatalogPayload(db) });
    return jsonResponse({ ok: true, available: prod.available });
  }

  if (method === 'PATCH' && pathname === '/api/admin/store-open') {
    const body = parseBody(init) as { manualOpenOverride: StoreSettings['manualOpenOverride'] };
    db.settings.manualOpenOverride = body.manualOpenOverride;
    saveDB(db);
    const payload = buildCatalogPayload(db);
    emitLocalSync({ type: 'catalog:updated', data: payload });
    return jsonResponse({ settings: db.settings, isOpenNow: payload.isOpenNow });
  }

  // OWNER-ONLY
  if (authed.role !== 'owner') {
    return jsonResponse({ error: 'Acesso exclusivo do perfil Dono.' }, 403);
  }

  if (method === 'POST' && pathname === '/api/admin/upload') {
    if (!(init?.body instanceof FormData)) return jsonResponse({ error: 'Nenhum arquivo enviado.' }, 400);
    const file = init.body.get('file');
    if (!(file instanceof File)) return jsonResponse({ error: 'Nenhum arquivo enviado.' }, 400);
    const url = await fileToDataUrl(file);
    return jsonResponse({ url, name: file.name });
  }

  if (method === 'PUT' && pathname === '/api/admin/settings') {
    const body = parseBody(init) as Partial<StoreSettings>;
    db.settings = { ...db.settings, ...body };
    saveDB(db);
    const payload = buildCatalogPayload(db);
    emitLocalSync({ type: 'catalog:updated', data: payload });
    return jsonResponse({ settings: db.settings, isOpenNow: payload.isOpenNow });
  }

  if (method === 'PUT' && pathname === '/api/admin/builder') {
    db.builderConfig = parseBody(init) as unknown as BuilderConfig;
    saveDB(db);
    emitLocalSync({ type: 'catalog:updated', data: buildCatalogPayload(db) });
    return jsonResponse(db.builderConfig);
  }

  if (method === 'POST' && pathname === '/api/admin/categories') {
    const body = parseBody(init) as Partial<MenuCategory>;
    if (!body.name?.trim()) return jsonResponse({ error: 'Informe o nome da categoria.' }, 400);
    const maxSort = db.categories.reduce((m, c) => Math.max(m, c.sortOrder), 0);
    const slug = body.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-');
    db.categories.push({
      id: `cat-${Date.now().toString(36)}`,
      slug,
      name: body.name.trim(),
      subtitle: body.subtitle || '',
      sortOrder: maxSort + 1,
      isStar: Boolean(body.isStar),
      layoutType: body.layoutType || 'list',
    });
    saveDB(db);
    emitLocalSync({ type: 'catalog:updated', data: buildCatalogPayload(db) });
    return jsonResponse(db.categories, 201);
  }

  if (method === 'POST' && pathname === '/api/admin/categories/reorder') {
    const body = parseBody(init) as { orderedIds?: string[] };
    if (Array.isArray(body.orderedIds)) {
      body.orderedIds.forEach((id, idx) => {
        const c = db.categories.find((cat) => cat.id === id);
        if (c) c.sortOrder = idx + 1;
      });
      saveDB(db);
      emitLocalSync({ type: 'catalog:updated', data: buildCatalogPayload(db) });
    }
    return jsonResponse([...db.categories].sort((a, b) => a.sortOrder - b.sortOrder));
  }

  const catIdMatch = pathname.match(/^\/api\/admin\/categories\/([^/]+)$/);
  if (catIdMatch && method === 'PUT') {
    const body = parseBody(init) as Partial<MenuCategory>;
    const cat = db.categories.find((c) => c.id === catIdMatch[1]);
    if (cat) {
      cat.name = body.name || '';
      cat.subtitle = body.subtitle || '';
      cat.isStar = Boolean(body.isStar);
      cat.layoutType = body.layoutType || 'list';
      saveDB(db);
      emitLocalSync({ type: 'catalog:updated', data: buildCatalogPayload(db) });
    }
    return jsonResponse(db.categories);
  }
  if (catIdMatch && method === 'DELETE') {
    db.products = db.products.filter((p) => p.categoryId !== catIdMatch[1]);
    db.categories = db.categories.filter((c) => c.id !== catIdMatch[1]);
    saveDB(db);
    emitLocalSync({ type: 'catalog:updated', data: buildCatalogPayload(db) });
    return jsonResponse({ ok: true });
  }

  if (method === 'POST' && pathname === '/api/admin/products') {
    const p = parseBody(init) as Partial<Product>;
    if (!p.name?.trim() || !p.categoryId) {
      return jsonResponse({ error: 'Nome e categoria são obrigatórios.' }, 400);
    }
    const maxSort = db.products
      .filter((pr) => pr.categoryId === p.categoryId)
      .reduce((m, pr) => Math.max(m, pr.sortOrder), 0);
    db.products.push({
      id: `prod-${Date.now().toString(36)}`,
      categoryId: p.categoryId,
      name: p.name.trim(),
      description: p.description || '',
      price: Number(p.price || 0),
      imageUrl: p.imageUrl || '',
      badge: p.badge || '',
      available: p.available !== false,
      sortOrder: maxSort + 1,
      alcoholWarning: Boolean(p.alcoholWarning),
      optionGroups: p.optionGroups || [],
    });
    saveDB(db);
    emitLocalSync({ type: 'catalog:updated', data: buildCatalogPayload(db) });
    return jsonResponse(db.products, 201);
  }

  if (method === 'POST' && pathname === '/api/admin/products/reorder') {
    const body = parseBody(init) as { orderedIds?: string[] };
    if (Array.isArray(body.orderedIds)) {
      body.orderedIds.forEach((id, idx) => {
        const p = db.products.find((pr) => pr.id === id);
        if (p) p.sortOrder = idx + 1;
      });
      saveDB(db);
      emitLocalSync({ type: 'catalog:updated', data: buildCatalogPayload(db) });
    }
    return jsonResponse([...db.products].sort((a, b) => a.sortOrder - b.sortOrder));
  }

  const dupMatch = pathname.match(/^\/api\/admin\/products\/([^/]+)\/duplicate$/);
  if (method === 'POST' && dupMatch) {
    const orig = db.products.find((p) => p.id === dupMatch[1]);
    if (!orig) return jsonResponse({ error: 'Produto não encontrado.' }, 404);
    db.products.push({
      ...JSON.parse(JSON.stringify(orig)),
      id: `prod-${Date.now().toString(36)}`,
      name: `${orig.name} (Cópia)`,
      sortOrder: orig.sortOrder + 1,
    });
    saveDB(db);
    emitLocalSync({ type: 'catalog:updated', data: buildCatalogPayload(db) });
    return jsonResponse(db.products, 201);
  }

  const prodIdMatch = pathname.match(/^\/api\/admin\/products\/([^/]+)$/);
  if (prodIdMatch && method === 'PUT') {
    const p = parseBody(init) as Partial<Product>;
    const existing = db.products.find((pr) => pr.id === prodIdMatch[1]);
    if (existing) {
      existing.categoryId = p.categoryId || '';
      existing.name = p.name || '';
      existing.description = p.description || '';
      existing.price = Number(p.price || 0);
      existing.imageUrl = p.imageUrl || '';
      existing.badge = p.badge || '';
      existing.available = p.available !== false;
      existing.alcoholWarning = Boolean(p.alcoholWarning);
      existing.optionGroups = p.optionGroups || [];
      saveDB(db);
      emitLocalSync({ type: 'catalog:updated', data: buildCatalogPayload(db) });
    }
    return jsonResponse(db.products);
  }
  if (prodIdMatch && method === 'DELETE') {
    db.products = db.products.filter((p) => p.id !== prodIdMatch[1]);
    saveDB(db);
    emitLocalSync({ type: 'catalog:updated', data: buildCatalogPayload(db) });
    return jsonResponse({ ok: true });
  }

  if (method === 'GET' && pathname === '/api/admin/reports') {
    const orders = db.orders.map((o) => o.order).filter((o) => o.status !== 'cancelled');
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    const todayOrders = orders.filter((o) => o.createdAt.slice(0, 10) === todayStr);
    const yesterdayOrders = orders.filter((o) => o.createdAt.slice(0, 10) === yesterdayStr);
    const todayRevenue = todayOrders.reduce((acc, o) => acc + o.total, 0);
    const yesterdayRevenue = yesterdayOrders.reduce((acc, o) => acc + o.total, 0);
    const todayCount = todayOrders.length;
    const yesterdayCount = yesterdayOrders.length;
    const averageTicket = todayCount > 0 ? todayRevenue / todayCount : 0;

    const itemMap = new Map<string, { name: string; quantity: number; revenue: number }>();
    const payMap = new Map<PaymentMethod, { method: PaymentMethod; count: number; total: number }>([
      ['pix', { method: 'pix', count: 0, total: 0 }],
      ['card', { method: 'card', count: 0, total: 0 }],
      ['cash', { method: 'cash', count: 0, total: 0 }],
    ]);
    const hourMap = new Map<number, { count: number; revenue: number }>();

    for (const o of todayOrders) {
      const pay = payMap.get(o.paymentMethod)!;
      pay.count += 1;
      pay.total += o.total;
      const hr = new Date(o.createdAt).getHours();
      const hrEntry = hourMap.get(hr) || { count: 0, revenue: 0 };
      hrEntry.count += 1;
      hrEntry.revenue += o.total;
      hourMap.set(hr, hrEntry);
      for (const item of o.items) {
        const cur = itemMap.get(item.name) || { name: item.name, quantity: 0, revenue: 0 };
        cur.quantity += item.quantity;
        cur.revenue += item.unitPrice * item.quantity;
        itemMap.set(item.name, cur);
      }
    }

    const report: AdminReports = {
      todayRevenue,
      yesterdayRevenue,
      todayCount,
      yesterdayCount,
      averageTicket,
      topItems: Array.from(itemMap.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 6),
      byPayment: Array.from(payMap.values()),
      byHour: Array.from({ length: 12 }, (_, idx) => {
        const h = idx + 12;
        const found = hourMap.get(h) || { count: 0, revenue: 0 };
        return { hour: `${h}h`, count: found.count, revenue: found.revenue };
      }),
    };
    return jsonResponse(report);
  }

  if (method === 'GET' && pathname === '/api/admin/users') {
    return jsonResponse(db.staffUsers.map(toPublicUser));
  }

  if (method === 'POST' && pathname === '/api/admin/users') {
    const body = parseBody(init) as {
      name?: string;
      email?: string;
      password?: string;
      role?: StaffRole;
    };
    if (!body.name?.trim() || !body.email?.trim() || !body.password || body.password.length < 6) {
      return jsonResponse({ error: 'Preencha nome, e-mail e senha (mínimo 6 caracteres).' }, 400);
    }
    const exists = db.staffUsers.some(
      (u) => u.email.toLowerCase() === body.email!.trim().toLowerCase()
    );
    if (exists) {
      return jsonResponse({ error: 'Já existe um usuário com este e-mail.' }, 400);
    }
    db.staffUsers.push({
      id: `staff-${Date.now().toString(36)}`,
      name: body.name.trim(),
      email: body.email.trim(),
      password: body.password,
      role: body.role === 'owner' ? 'owner' : 'attendant',
      active: true,
      createdAt: new Date().toISOString(),
    });
    saveDB(db);
    return jsonResponse({ ok: true }, 201);
  }

  const userIdMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (userIdMatch && method === 'DELETE') {
    if (authed.id === userIdMatch[1]) {
      return jsonResponse({ error: 'Você não pode excluir sua própria conta logada.' }, 400);
    }
    db.sessions = db.sessions.filter((s) => s.userId !== userIdMatch[1]);
    db.staffUsers = db.staffUsers.filter((u) => u.id !== userIdMatch[1]);
    saveDB(db);
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: 'Rota não encontrada.' }, 404);
}
