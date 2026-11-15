import express, { Request, Response, NextFunction } from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { WebSocketServer, WebSocket } from 'ws';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import {
  DEFAULT_BUILDER_CONFIG,
  DEFAULT_CATEGORIES,
  DEFAULT_PRODUCTS,
  DEFAULT_SETTINGS,
} from './src/data/seedCatalog.ts';
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
} from './src/types.ts';
import { computeStoreOpen, generatePixPayload, normalizePhone } from './src/utils/format.ts';

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');
const RECEIPT_DIR = path.join(UPLOAD_DIR, 'receipts');
const MEDIA_DIR = path.join(UPLOAD_DIR, 'media');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(RECEIPT_DIR, { recursive: true });
fs.mkdirSync(MEDIA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'tropicalia.db'));
db.exec(`PRAGMA journal_mode = WAL;`);

db.exec(`
  CREATE TABLE IF NOT EXISTS kv_store (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    subtitle TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    is_star INTEGER NOT NULL DEFAULT 0,
    layout_type TEXT NOT NULL DEFAULT 'list'
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    category_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    price REAL NOT NULL,
    image_url TEXT NOT NULL DEFAULT '',
    badge TEXT NOT NULL DEFAULT '',
    available INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    alcohol_warning INTEGER NOT NULL DEFAULT 0,
    option_groups_json TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    order_number INTEGER NOT NULL,
    customer_name TEXT NOT NULL,
    customer_whatsapp TEXT NOT NULL,
    customer_token TEXT NOT NULL,
    delivery_type TEXT NOT NULL,
    address_json TEXT,
    payment_method TEXT NOT NULL,
    cash_change_for REAL,
    pix_code TEXT,
    pix_receipt_url TEXT,
    pix_receipt_name TEXT,
    pix_confirmed INTEGER NOT NULL DEFAULT 0,
    items_json TEXT NOT NULL,
    subtotal REAL NOT NULL,
    delivery_fee REAL NOT NULL,
    total REAL NOT NULL,
    status TEXT NOT NULL,
    cancel_reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS staff_users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
`);

function seedIfEmpty() {
  const now = new Date().toISOString();

  const settingsRow = db.prepare(`SELECT value FROM kv_store WHERE key = 'settings'`).get() as
    | { value: string }
    | undefined;
  if (!settingsRow) {
    db.prepare(`INSERT INTO kv_store (key, value, updated_at) VALUES (?, ?, ?)`).run(
      'settings',
      JSON.stringify(DEFAULT_SETTINGS),
      now
    );
  } else {
    const migratedHours = db
      .prepare(`SELECT value FROM kv_store WHERE key = 'migrated_hours_10_23'`)
      .get();
    if (!migratedHours) {
      const parsed = JSON.parse(settingsRow.value) as StoreSettings;
      parsed.openingHours = { ...DEFAULT_SETTINGS.openingHours };
      db.prepare(`UPDATE kv_store SET value = ?, updated_at = ? WHERE key = 'settings'`).run(
        JSON.stringify(parsed),
        now
      );
      db.prepare(`INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, ?)`).run(
        'migrated_hours_10_23',
        '1',
        now
      );
    }
  }

  const builderRow = db.prepare(`SELECT value FROM kv_store WHERE key = 'builder_config'`).get() as
    | { value: string }
    | undefined;
  if (!builderRow) {
    db.prepare(`INSERT INTO kv_store (key, value, updated_at) VALUES (?, ?, ?)`).run(
      'builder_config',
      JSON.stringify(DEFAULT_BUILDER_CONFIG),
      now
    );
  }

  const catCount = (db.prepare(`SELECT COUNT(*) as c FROM categories`).get() as { c: number }).c;
  if (catCount === 0) {
    const insertCat = db.prepare(
      `INSERT INTO categories (id, slug, name, subtitle, sort_order, is_star, layout_type) VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const cat of DEFAULT_CATEGORIES) {
      insertCat.run(
        cat.id,
        cat.slug,
        cat.name,
        cat.subtitle,
        cat.sortOrder,
        cat.isStar ? 1 : 0,
        cat.layoutType
      );
    }
  }

  const prodCount = (db.prepare(`SELECT COUNT(*) as c FROM products`).get() as { c: number }).c;
  if (prodCount === 0) {
    const insertProd = db.prepare(
      `INSERT INTO products (id, category_id, name, description, price, image_url, badge, available, sort_order, alcohol_warning, option_groups_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const p of DEFAULT_PRODUCTS) {
      insertProd.run(
        p.id,
        p.categoryId,
        p.name,
        p.description,
        p.price,
        p.imageUrl || '',
        p.badge || '',
        p.available ? 1 : 0,
        p.sortOrder,
        p.alcoholWarning ? 1 : 0,
        JSON.stringify(p.optionGroups || [])
      );
    }
  } else {
    const updateImg = db.prepare(
      `UPDATE products SET image_url = ? WHERE id = ? AND (image_url IS NULL OR image_url = '')`
    );
    for (const p of DEFAULT_PRODUCTS) {
      if (p.imageUrl) {
        updateImg.run(p.imageUrl, p.id);
      }
    }
  }

  // Remove legacy default seeded accounts so only the owner's configured account remains
  db.prepare(`DELETE FROM sessions WHERE user_id IN ('staff-owner-1', 'staff-attendant-1')`).run();
  db.prepare(`DELETE FROM staff_users WHERE id IN ('staff-owner-1', 'staff-attendant-1')`).run();

  const ownerCount = (
    db.prepare(`SELECT COUNT(*) as c FROM staff_users WHERE role = 'owner' AND active = 1`).get() as {
      c: number;
    }
  ).c;

  if (ownerCount === 0) {
    db.prepare(
      `INSERT INTO staff_users (id, name, email, password_hash, role, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)`
    ).run(
      'staff-owner-tropicalia',
      'Tropicália',
      'tropicalia@gmail.com',
      bcrypt.hashSync('melhor2027', 10),
      'owner',
      now
    );
  }
}

seedIfEmpty();

// Helpers to read structured state
function getSettings(): StoreSettings {
  const row = db.prepare(`SELECT value FROM kv_store WHERE key = 'settings'`).get() as { value: string };
  return JSON.parse(row.value) as StoreSettings;
}

function saveSettings(settings: StoreSettings) {
  db.prepare(`INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES ('settings', ?, ?)`).run(
    JSON.stringify(settings),
    new Date().toISOString()
  );
}

function getBuilderConfig(): BuilderConfig {
  const row = db.prepare(`SELECT value FROM kv_store WHERE key = 'builder_config'`).get() as {
    value: string;
  };
  return JSON.parse(row.value) as BuilderConfig;
}

function saveBuilderConfig(config: BuilderConfig) {
  db.prepare(
    `INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES ('builder_config', ?, ?)`
  ).run(JSON.stringify(config), new Date().toISOString());
}

function getCategories(): MenuCategory[] {
  const rows = db.prepare(`SELECT * FROM categories ORDER BY sort_order ASC`).all() as Array<{
    id: string;
    slug: string;
    name: string;
    subtitle: string;
    sort_order: number;
    is_star: number;
    layout_type: MenuCategory['layoutType'];
  }>;
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    subtitle: r.subtitle,
    sortOrder: r.sort_order,
    isStar: Boolean(r.is_star),
    layoutType: r.layout_type,
  }));
}

function getProducts(): Product[] {
  const rows = db.prepare(`SELECT * FROM products ORDER BY sort_order ASC, name ASC`).all() as Array<{
    id: string;
    category_id: string;
    name: string;
    description: string;
    price: number;
    image_url: string;
    badge: string;
    available: number;
    sort_order: number;
    alcohol_warning: number;
    option_groups_json: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    categoryId: r.category_id,
    name: r.name,
    description: r.description,
    price: r.price,
    imageUrl: r.image_url,
    badge: r.badge,
    available: Boolean(r.available),
    sortOrder: r.sort_order,
    alcoholWarning: Boolean(r.alcohol_warning),
    optionGroups: JSON.parse(r.option_groups_json || '[]'),
  }));
}

function mapOrderRow(r: Record<string, unknown>): Order {
  return {
    id: r.id as string,
    orderNumber: r.order_number as number,
    customerName: r.customer_name as string,
    customerWhatsapp: r.customer_whatsapp as string,
    deliveryType: r.delivery_type as Order['deliveryType'],
    address: r.address_json ? JSON.parse(r.address_json as string) : null,
    paymentMethod: r.payment_method as PaymentMethod,
    cashChangeFor: (r.cash_change_for as number | null) ?? null,
    pixCode: (r.pix_code as string | null) ?? null,
    pixReceiptUrl: (r.pix_receipt_url as string | null) ?? null,
    pixReceiptName: (r.pix_receipt_name as string | null) ?? null,
    pixConfirmed: Boolean(r.pix_confirmed),
    items: JSON.parse(r.items_json as string) as CartItem[],
    subtotal: r.subtotal as number,
    deliveryFee: r.delivery_fee as number,
    total: r.total as number,
    status: r.status as OrderStatus,
    cancelReason: (r.cancel_reason as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function getOrderByIdRaw(id: string): { order: Order; customerToken: string } | null {
  const row = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  return {
    order: mapOrderRow(row),
    customerToken: row.customer_token as string,
  };
}

function getSessionUser(token: string | undefined): StaffUser | null {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.role, u.active, u.created_at, s.expires_at
       FROM sessions s
       JOIN staff_users u ON u.id = s.user_id
       WHERE s.token = ? AND u.active = 1`
    )
    .get(token) as
    | {
        id: string;
        name: string;
        email: string;
        role: StaffRole;
        active: number;
        created_at: string;
        expires_at: string;
      }
    | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
    return null;
  }
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    active: Boolean(row.active),
    createdAt: row.created_at,
  };
}

function extractBearerToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)tropicalia_staff=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return undefined;
}

interface AuthedRequest extends Request {
  staffUser?: StaffUser;
}

function requireStaff(req: AuthedRequest, res: Response, next: NextFunction) {
  const user = getSessionUser(extractBearerToken(req));
  if (!user) {
    res.status(401).json({ error: 'Sessão expirada ou não autenticada. Faça login novamente.' });
    return;
  }
  req.staffUser = user;
  next();
}

function requireOwner(req: AuthedRequest, res: Response, next: NextFunction) {
  requireStaff(req, res, () => {
    if (req.staffUser?.role !== 'owner') {
      res.status(403).json({ error: 'Acesso exclusivo do perfil Dono.' });
      return;
    }
    next();
  });
}

// Express & WebSocket Setup
const app = express();
app.use(express.json({ limit: '4mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));

const httpServer = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

interface WsClientMeta {
  ws: WebSocket;
  channel: 'storefront' | 'customer' | 'admin';
  customerToken?: string;
  customerWhatsapp?: string;
  staffRole?: StaffRole;
  isAlive: boolean;
}

const wsClients = new Set<WsClientMeta>();

httpServer.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url || '/', `http://${request.headers.host}`);
  if (url.pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  }
});

wss.on('connection', (ws) => {
  const meta: WsClientMeta = { ws, channel: 'storefront', isAlive: true };
  wsClients.add(meta);

  ws.on('pong', () => {
    meta.isAlive = true;
  });

  ws.on('message', (raw) => {
    meta.isAlive = true;
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'ping') {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        }
        return;
      }
      if (msg.type === 'subscribe') {
        if (msg.channel === 'admin') {
          const user = getSessionUser(msg.token);
          if (user) {
            meta.channel = 'admin';
            meta.staffRole = user.role;
            ws.send(JSON.stringify({ type: 'subscribed', channel: 'admin' }));
          } else {
            ws.send(JSON.stringify({ type: 'auth_error', channel: 'admin' }));
          }
        } else if (msg.channel === 'customer' && typeof msg.customerToken === 'string') {
          meta.channel = 'customer';
          meta.customerToken = msg.customerToken;
          if (typeof msg.customerWhatsapp === 'string') {
            meta.customerWhatsapp = normalizePhone(msg.customerWhatsapp);
          }
          ws.send(JSON.stringify({ type: 'subscribed', channel: 'customer' }));
        } else {
          meta.channel = 'storefront';
          ws.send(JSON.stringify({ type: 'subscribed', channel: 'storefront' }));
        }
      }
    } catch {
      // ignore malformed ws message
    }
  });

  ws.on('close', () => {
    wsClients.delete(meta);
  });

  ws.on('error', () => {
    wsClients.delete(meta);
  });
});

// Keep WebSocket connections alive across reverse proxies & clean up dead sockets
const wsHeartbeatTimer = setInterval(() => {
  for (const client of wsClients) {
    if (!client.isAlive) {
      wsClients.delete(client);
      try {
        client.ws.terminate();
      } catch {
        // ignore
      }
      continue;
    }
    client.isAlive = false;
    try {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.ping();
      }
    } catch {
      // ignore
    }
  }
}, 15000);
wsHeartbeatTimer.unref?.();

function broadcastCatalogUpdate() {
  const settings = getSettings();
  const payload = JSON.stringify({
    type: 'catalog:updated',
    data: {
      settings,
      categories: getCategories(),
      products: getProducts(),
      builderConfig: getBuilderConfig(),
      isOpenNow: computeStoreOpen(settings),
    },
  });
  for (const client of wsClients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  }
}

function broadcastOrderCreated(order: Order) {
  const payload = JSON.stringify({ type: 'order:created', data: order });
  for (const client of wsClients) {
    if (client.ws.readyState === WebSocket.OPEN && client.channel === 'admin') {
      client.ws.send(payload);
    }
  }
}

function broadcastOrderUpdated(order: Order, customerToken: string) {
  const payload = JSON.stringify({ type: 'order:updated', data: order });
  for (const client of wsClients) {
    if (client.ws.readyState !== WebSocket.OPEN) continue;
    if (client.channel === 'admin') {
      client.ws.send(payload);
    } else if (
      client.channel === 'customer' &&
      (client.customerToken === customerToken ||
        (client.customerWhatsapp &&
          client.customerWhatsapp.length >= 10 &&
          client.customerWhatsapp === order.customerWhatsapp))
    ) {
      client.ws.send(payload);
    }
  }
}

// Multer storage for receipts & store media
const receiptUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, RECEIPT_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.bin';
      cb(null, `rec-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^(image\/(jpeg|jpg|png|webp|gif|heic)|application\/pdf)$/i.test(file.mimetype);
    cb(null, ok);
  },
});

const mediaUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, MEDIA_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.png';
      cb(null, `media-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// ================= PUBLIC STOREFRONT ROUTES =================
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, mode: 'server', ts: Date.now() });
});

app.get('/api/store/catalog', (_req, res) => {
  const settings = getSettings();
  res.json({
    settings,
    categories: getCategories(),
    products: getProducts(),
    builderConfig: getBuilderConfig(),
    isOpenNow: computeStoreOpen(settings),
  });
});

app.post('/api/orders', (req, res) => {
  try {
    const settings = getSettings();
    if (!computeStoreOpen(settings)) {
      res.status(400).json({ error: 'A loja está fechada no momento. Confira o horário de funcionamento.' });
      return;
    }

    const {
      customerName,
      customerWhatsapp,
      customerToken,
      deliveryType,
      address,
      paymentMethod,
      cashChangeFor,
      items,
    } = req.body as {
      customerName: string;
      customerWhatsapp: string;
      customerToken: string;
      deliveryType: 'delivery' | 'pickup';
      address: Order['address'];
      paymentMethod: PaymentMethod;
      cashChangeFor: number | null;
      items: CartItem[];
    };

    if (!customerName?.trim() || normalizePhone(customerWhatsapp || '').length < 10) {
      res.status(400).json({ error: 'Informe seu nome completo e um WhatsApp válido com DDD.' });
      return;
    }
    if (!customerToken || customerToken.length < 12) {
      res.status(400).json({ error: 'Token de sessão do cliente inválido.' });
      return;
    }
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Seu carrinho está vazio.' });
      return;
    }
    if (deliveryType === 'delivery' && (!address?.street?.trim() || !address?.number?.trim() || !address?.neighborhood?.trim())) {
      res.status(400).json({ error: 'Preencha rua, número e bairro para a entrega.' });
      return;
    }

    const subtotal = Number(
      items.reduce((acc, item) => acc + Number(item.unitPrice) * Number(item.quantity), 0).toFixed(2)
    );
    const deliveryFee = deliveryType === 'delivery' ? Number(settings.deliveryFee) : 0;
    const total = Number((subtotal + deliveryFee).toFixed(2));

    const maxOrderRow = db.prepare(`SELECT COALESCE(MAX(order_number), 100) as maxNum FROM orders`).get() as {
      maxNum: number;
    };
    const orderNumber = maxOrderRow.maxNum + 1;
    const id = `ord_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const initialStatus: OrderStatus = paymentMethod === 'pix' ? 'awaiting_payment' : 'pending';

    const pixCode =
      paymentMethod === 'pix'
        ? generatePixPayload({
            pixKey: settings.pixKey,
            receiverName: settings.pixReceiverName,
            receiverCity: settings.pixReceiverCity,
            amount: total,
            txId: `TROP${orderNumber}`,
          })
        : null;

    const cleanWhatsapp = normalizePhone(customerWhatsapp);

    db.prepare(
      `INSERT INTO orders (
        id, order_number, customer_name, customer_whatsapp, customer_token,
        delivery_type, address_json, payment_method, cash_change_for,
        pix_code, pix_receipt_url, pix_receipt_name, pix_confirmed,
        items_json, subtotal, delivery_fee, total, status, cancel_reason,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0, ?, ?, ?, ?, ?, NULL, ?, ?)`
    ).run(
      id,
      orderNumber,
      customerName.trim(),
      cleanWhatsapp,
      customerToken,
      deliveryType,
      deliveryType === 'delivery' ? JSON.stringify(address) : null,
      paymentMethod,
      paymentMethod === 'cash' ? cashChangeFor : null,
      pixCode,
      JSON.stringify(items),
      subtotal,
      deliveryFee,
      total,
      initialStatus,
      now,
      now
    );

    const created = getOrderByIdRaw(id)!;
    broadcastOrderCreated(created.order);
    res.status(201).json(created.order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Não foi possível registrar seu pedido. Tente novamente.' });
  }
});

// Customer sees ALL orders created with their device token or matching WhatsApp (kept forever in history)
app.get('/api/orders/mine', (req, res) => {
  const token = String(req.query.token || '');
  const whatsapp = normalizePhone(String(req.query.whatsapp || ''));
  if (!token || token.length < 12) {
    res.json([]);
    return;
  }

  const rows =
    whatsapp.length >= 10
      ? (db
          .prepare(
            `SELECT * FROM orders WHERE customer_token = ? OR customer_whatsapp = ? ORDER BY created_at DESC`
          )
          .all(token, whatsapp) as Array<Record<string, unknown>>)
      : (db
          .prepare(`SELECT * FROM orders WHERE customer_token = ? ORDER BY created_at DESC`)
          .all(token) as Array<Record<string, unknown>>);

  res.json(rows.map(mapOrderRow));
});

app.get('/api/orders/:id', (req, res) => {
  const token = String(req.query.token || '');
  const found = getOrderByIdRaw(req.params.id);
  if (!found) {
    res.status(404).json({ error: 'Pedido não encontrado.' });
    return;
  }
  const staff = getSessionUser(extractBearerToken(req));
  if (!staff && found.customerToken !== token) {
    res.status(403).json({ error: 'Você só pode acessar os pedidos feitos neste aparelho.' });
    return;
  }
  res.json(found.order);
});

app.post('/api/orders/:id/receipt', receiptUpload.single('receipt'), (req, res) => {
  const token = String(req.body.customerToken || req.query.token || '');
  const found = getOrderByIdRaw(req.params.id);
  if (!found) {
    res.status(404).json({ error: 'Pedido não encontrado.' });
    return;
  }
  if (found.customerToken !== token) {
    res.status(403).json({ error: 'Acesso negado a este pedido.' });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: 'Envie uma foto (JPG/PNG/WEBP) ou arquivo PDF válido.' });
    return;
  }

  const receiptUrl = `/uploads/receipts/${req.file.filename}`;
  const receiptName = req.file.originalname;
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE orders SET pix_receipt_url = ?, pix_receipt_name = ?, updated_at = ? WHERE id = ?`
  ).run(receiptUrl, receiptName, now, found.order.id);

  const updated = getOrderByIdRaw(found.order.id)!;
  broadcastOrderUpdated(updated.order, updated.customerToken);
  res.json(updated.order);
});

// ================= AUTH ROUTES =================
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: 'Informe e-mail e senha.' });
    return;
  }
  const row = db
    .prepare(`SELECT * FROM staff_users WHERE LOWER(email) = LOWER(?) AND active = 1`)
    .get(email.trim()) as
    | {
        id: string;
        name: string;
        email: string;
        password_hash: string;
        role: StaffRole;
        active: number;
        created_at: string;
      }
    | undefined;

  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    res.status(401).json({ error: 'E-mail ou senha inválidos. Confira e tente novamente.' });
    return;
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`).run(
    token,
    row.id,
    expiresAt
  );

  res.setHeader(
    'Set-Cookie',
    `tropicalia_staff=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}`
  );

  res.json({
    token,
    user: {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      active: Boolean(row.active),
      createdAt: row.created_at,
    },
  });
});

app.post('/api/auth/logout', (req, res) => {
  const token = extractBearerToken(req);
  if (token) {
    db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
  }
  res.setHeader('Set-Cookie', 'tropicalia_staff=; Path=/; HttpOnly; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/auth/me', requireStaff, (req: AuthedRequest, res) => {
  res.json({ user: req.staffUser });
});

// ================= ADMIN ROUTES (OWNER + ATTENDANT) =================
app.get('/api/admin/orders', requireStaff, (_req, res) => {
  const rows = db.prepare(`SELECT * FROM orders ORDER BY created_at DESC`).all() as Array<
    Record<string, unknown>
  >;
  res.json(rows.map(mapOrderRow));
});

app.post('/api/admin/orders/:id/confirm-pix', requireStaff, (req, res) => {
  const found = getOrderByIdRaw(req.params.id);
  if (!found) {
    res.status(404).json({ error: 'Pedido não encontrado.' });
    return;
  }
  const now = new Date().toISOString();
  const nextStatus: OrderStatus =
    found.order.status === 'awaiting_payment' || found.order.status === 'pending'
      ? 'preparing'
      : found.order.status;

  db.prepare(`UPDATE orders SET pix_confirmed = 1, status = ?, updated_at = ? WHERE id = ?`).run(
    nextStatus,
    now,
    found.order.id
  );
  const updated = getOrderByIdRaw(found.order.id)!;
  broadcastOrderUpdated(updated.order, updated.customerToken);
  res.json(updated.order);
});

app.patch('/api/admin/orders/:id/status', requireStaff, (req, res) => {
  const { status, cancelReason } = req.body as { status: OrderStatus; cancelReason?: string };
  const found = getOrderByIdRaw(req.params.id);
  if (!found) {
    res.status(404).json({ error: 'Pedido não encontrado.' });
    return;
  }

  if (
    found.order.paymentMethod === 'pix' &&
    !found.order.pixConfirmed &&
    ['preparing', 'ready', 'out_for_delivery', 'delivered'].includes(status)
  ) {
    res.status(400).json({
      error: 'Confirme o pagamento do Pix antes de iniciar o preparo deste pedido.',
    });
    return;
  }

  const now = new Date().toISOString();
  db.prepare(`UPDATE orders SET status = ?, cancel_reason = ?, updated_at = ? WHERE id = ?`).run(
    status,
    status === 'cancelled' ? cancelReason || 'Pedido recusado pela loja.' : found.order.cancelReason,
    now,
    found.order.id
  );

  const updated = getOrderByIdRaw(found.order.id)!;
  broadcastOrderUpdated(updated.order, updated.customerToken);
  res.json(updated.order);
});

app.patch('/api/admin/products/:id/availability', requireStaff, (req, res) => {
  const { available } = req.body as { available: boolean };
  const existing = db.prepare(`SELECT id FROM products WHERE id = ?`).get(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Produto não encontrado.' });
    return;
  }
  db.prepare(`UPDATE products SET available = ? WHERE id = ?`).run(available ? 1 : 0, req.params.id);
  broadcastCatalogUpdate();
  res.json({ ok: true, available: Boolean(available) });
});

app.patch('/api/admin/store-open', requireStaff, (req, res) => {
  const { manualOpenOverride } = req.body as { manualOpenOverride: StoreSettings['manualOpenOverride'] };
  const settings = getSettings();
  settings.manualOpenOverride = manualOpenOverride;
  saveSettings(settings);
  broadcastCatalogUpdate();
  res.json({ settings, isOpenNow: computeStoreOpen(settings) });
});

// ================= OWNER-ONLY ADMIN ROUTES =================
app.post('/api/admin/upload', requireOwner, mediaUpload.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    return;
  }
  res.json({
    url: `/uploads/media/${req.file.filename}`,
    name: req.file.originalname,
  });
});

app.put('/api/admin/settings', requireOwner, (req, res) => {
  const current = getSettings();
  const next: StoreSettings = { ...current, ...req.body };
  saveSettings(next);
  broadcastCatalogUpdate();
  res.json({ settings: next, isOpenNow: computeStoreOpen(next) });
});

app.put('/api/admin/builder', requireOwner, (req, res) => {
  const config = req.body as BuilderConfig;
  saveBuilderConfig(config);
  broadcastCatalogUpdate();
  res.json(config);
});

app.post('/api/admin/categories', requireOwner, (req, res) => {
  const { name, subtitle, isStar, layoutType } = req.body as Partial<MenuCategory>;
  if (!name?.trim()) {
    res.status(400).json({ error: 'Informe o nome da categoria.' });
    return;
  }
  const id = `cat-${crypto.randomUUID().slice(0, 8)}`;
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-');
  const maxSort = (db.prepare(`SELECT COALESCE(MAX(sort_order), 0) as m FROM categories`).get() as { m: number }).m;
  db.prepare(
    `INSERT INTO categories (id, slug, name, subtitle, sort_order, is_star, layout_type) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, slug, name.trim(), subtitle || '', maxSort + 1, isStar ? 1 : 0, layoutType || 'list');
  broadcastCatalogUpdate();
  res.status(201).json(getCategories());
});

app.put('/api/admin/categories/:id', requireOwner, (req, res) => {
  const { name, subtitle, isStar, layoutType } = req.body as Partial<MenuCategory>;
  db.prepare(`UPDATE categories SET name = ?, subtitle = ?, is_star = ?, layout_type = ? WHERE id = ?`).run(
    name || '',
    subtitle || '',
    isStar ? 1 : 0,
    layoutType || 'list',
    req.params.id
  );
  broadcastCatalogUpdate();
  res.json(getCategories());
});

app.post('/api/admin/categories/reorder', requireOwner, (req, res) => {
  const { orderedIds } = req.body as { orderedIds: string[] };
  if (Array.isArray(orderedIds)) {
    const stmt = db.prepare(`UPDATE categories SET sort_order = ? WHERE id = ?`);
    orderedIds.forEach((id, idx) => stmt.run(idx + 1, id));
    broadcastCatalogUpdate();
  }
  res.json(getCategories());
});

app.delete('/api/admin/categories/:id', requireOwner, (req, res) => {
  db.prepare(`DELETE FROM products WHERE category_id = ?`).run(req.params.id);
  db.prepare(`DELETE FROM categories WHERE id = ?`).run(req.params.id);
  broadcastCatalogUpdate();
  res.json({ ok: true });
});

app.post('/api/admin/products', requireOwner, (req, res) => {
  const p = req.body as Partial<Product>;
  if (!p.name?.trim() || !p.categoryId) {
    res.status(400).json({ error: 'Nome e categoria são obrigatórios.' });
    return;
  }
  const id = `prod-${crypto.randomUUID().slice(0, 8)}`;
  const maxSort = (
    db.prepare(`SELECT COALESCE(MAX(sort_order), 0) as m FROM products WHERE category_id = ?`).get(p.categoryId) as {
      m: number;
    }
  ).m;

  db.prepare(
    `INSERT INTO products (id, category_id, name, description, price, image_url, badge, available, sort_order, alcohol_warning, option_groups_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    p.categoryId,
    p.name.trim(),
    p.description || '',
    Number(p.price || 0),
    p.imageUrl || '',
    p.badge || '',
    p.available === false ? 0 : 1,
    maxSort + 1,
    p.alcoholWarning ? 1 : 0,
    JSON.stringify(p.optionGroups || [])
  );
  broadcastCatalogUpdate();
  res.status(201).json(getProducts());
});

app.put('/api/admin/products/:id', requireOwner, (req, res) => {
  const p = req.body as Partial<Product>;
  db.prepare(
    `UPDATE products SET category_id = ?, name = ?, description = ?, price = ?, image_url = ?, badge = ?, available = ?, alcohol_warning = ?, option_groups_json = ? WHERE id = ?`
  ).run(
    p.categoryId || '',
    p.name || '',
    p.description || '',
    Number(p.price || 0),
    p.imageUrl || '',
    p.badge || '',
    p.available === false ? 0 : 1,
    p.alcoholWarning ? 1 : 0,
    JSON.stringify(p.optionGroups || []),
    req.params.id
  );
  broadcastCatalogUpdate();
  res.json(getProducts());
});

app.post('/api/admin/products/:id/duplicate', requireOwner, (req, res) => {
  const row = db.prepare(`SELECT * FROM products WHERE id = ?`).get(req.params.id) as
    | Record<string, unknown>
    | undefined;
  if (!row) {
    res.status(404).json({ error: 'Produto não encontrado.' });
    return;
  }
  const id = `prod-${crypto.randomUUID().slice(0, 8)}`;
  db.prepare(
    `INSERT INTO products (id, category_id, name, description, price, image_url, badge, available, sort_order, alcohol_warning, option_groups_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    row.category_id as string,
    `${row.name as string} (Cópia)`,
    row.description as string,
    row.price as number,
    row.image_url as string,
    row.badge as string,
    row.available as number,
    (row.sort_order as number) + 1,
    row.alcohol_warning as number,
    row.option_groups_json as string
  );
  broadcastCatalogUpdate();
  res.status(201).json(getProducts());
});

app.post('/api/admin/products/reorder', requireOwner, (req, res) => {
  const { orderedIds } = req.body as { orderedIds: string[] };
  if (Array.isArray(orderedIds)) {
    const stmt = db.prepare(`UPDATE products SET sort_order = ? WHERE id = ?`);
    orderedIds.forEach((id, idx) => stmt.run(idx + 1, id));
    broadcastCatalogUpdate();
  }
  res.json(getProducts());
});

app.delete('/api/admin/products/:id', requireOwner, (req, res) => {
  db.prepare(`DELETE FROM products WHERE id = ?`).run(req.params.id);
  broadcastCatalogUpdate();
  res.json({ ok: true });
});

app.get('/api/admin/reports', requireOwner, (_req, res) => {
  const allRows = db
    .prepare(`SELECT * FROM orders WHERE status != 'cancelled' ORDER BY created_at DESC`)
    .all() as Array<Record<string, unknown>>;
  const orders = allRows.map(mapOrderRow);

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
    const payEntry = payMap.get(o.paymentMethod)!;
    payEntry.count += 1;
    payEntry.total += o.total;

    const hr = new Date(o.createdAt).getHours();
    const hrEntry = hourMap.get(hr) || { count: 0, revenue: 0 };
    hrEntry.count += 1;
    hrEntry.revenue += o.total;
    hourMap.set(hr, hrEntry);

    for (const item of o.items) {
      const existing = itemMap.get(item.name) || { name: item.name, quantity: 0, revenue: 0 };
      existing.quantity += item.quantity;
      existing.revenue += item.unitPrice * item.quantity;
      itemMap.set(item.name, existing);
    }
  }

  const topItems = Array.from(itemMap.values())
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 6);

  const byHour = Array.from({ length: 12 }, (_, idx) => {
    const h = idx + 12; // 12h - 23h
    const found = hourMap.get(h) || { count: 0, revenue: 0 };
    return { hour: `${h}h`, count: found.count, revenue: found.revenue };
  });

  const report: AdminReports = {
    todayRevenue,
    yesterdayRevenue,
    todayCount,
    yesterdayCount,
    averageTicket,
    topItems,
    byPayment: Array.from(payMap.values()),
    byHour,
  };

  res.json(report);
});

app.get('/api/admin/users', requireOwner, (_req, res) => {
  const rows = db
    .prepare(`SELECT id, name, email, role, active, created_at FROM staff_users ORDER BY created_at ASC`)
    .all() as Array<{
    id: string;
    name: string;
    email: string;
    role: StaffRole;
    active: number;
    created_at: string;
  }>;
  res.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      active: Boolean(r.active),
      createdAt: r.created_at,
    }))
  );
});

app.post('/api/admin/users', requireOwner, (req, res) => {
  const { name, email, password, role } = req.body as {
    name: string;
    email: string;
    password: string;
    role: StaffRole;
  };
  if (!name?.trim() || !email?.trim() || !password || password.length < 6) {
    res.status(400).json({ error: 'Preencha nome, e-mail e senha (mínimo 6 caracteres).' });
    return;
  }
  const existing = db.prepare(`SELECT id FROM staff_users WHERE LOWER(email) = LOWER(?)`).get(email.trim());
  if (existing) {
    res.status(400).json({ error: 'Já existe um usuário com este e-mail.' });
    return;
  }
  const id = `staff-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO staff_users (id, name, email, password_hash, role, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)`
  ).run(id, name.trim(), email.trim(), bcrypt.hashSync(password, 10), role === 'owner' ? 'owner' : 'attendant', now);
  res.status(201).json({ ok: true });
});

app.patch('/api/admin/users/:id', requireOwner, (req, res) => {
  const { name, role, active, password } = req.body as {
    name?: string;
    role?: StaffRole;
    active?: boolean;
    password?: string;
  };
  if (name) db.prepare(`UPDATE staff_users SET name = ? WHERE id = ?`).run(name.trim(), req.params.id);
  if (role) db.prepare(`UPDATE staff_users SET role = ? WHERE id = ?`).run(role, req.params.id);
  if (typeof active === 'boolean') {
    db.prepare(`UPDATE staff_users SET active = ? WHERE id = ?`).run(active ? 1 : 0, req.params.id);
  }
  if (password && password.length >= 6) {
    db.prepare(`UPDATE staff_users SET password_hash = ? WHERE id = ?`).run(
      bcrypt.hashSync(password, 10),
      req.params.id
    );
  }
  res.json({ ok: true });
});

app.delete('/api/admin/users/:id', requireOwner, (req: AuthedRequest, res) => {
  if (req.staffUser?.id === req.params.id) {
    res.status(400).json({ error: 'Você não pode excluir sua própria conta logada.' });
    return;
  }
  db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(req.params.id);
  db.prepare(`DELETE FROM staff_users WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

// ================= VITE / STATIC FRONTEND SERVING =================
async function start() {
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Rota de API não encontrada.' });
  });

  const isProd = process.env.NODE_ENV === 'production';
  let servedByVite = false;

  if (!isProd) {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
      servedByVite = true;
    } catch {
      servedByVite = false;
    }
  }

  if (!servedByVite) {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(503).send('Build não encontrado. Execute "npm run build" antes de iniciar.');
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Tropicália Açaí rodando em http://localhost:${PORT}`);
  });
}

start();
