export type DeliveryType = 'delivery' | 'pickup';
export type PaymentMethod = 'pix' | 'card' | 'cash';
export type OrderStatus =
  | 'awaiting_payment'
  | 'pending'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export type StaffRole = 'owner' | 'attendant';

export interface OpeningHourDay {
  enabled: boolean;
  open: string;
  close: string;
}

export interface TeamPhoto {
  id: string;
  url: string;
  caption: string;
}

export interface StatusMessages {
  awaiting_payment: string;
  pending: string;
  preparing: string;
  ready: string;
  ready_pickup: string;
  out_for_delivery: string;
  delivered: string;
  cancelled: string;
}

export interface StoreSettings {
  storeName: string;
  logoUrl: string;
  heroBowlUrl: string;
  heroVideoUrl: string;
  heroBannerUrl: string;
  teamPhotos: TeamPhoto[];
  manualOpenOverride: 'auto' | 'open' | 'closed';
  openingHours: Record<number, OpeningHourDay>;
  deliveryFee: number;
  estimatedTime: string;
  pickupAddress: string;
  pixKey: string;
  pixKeyDisplay: string;
  pixReceiverName: string;
  pixReceiverCity: string;
  whatsappNumber: string;
  instagramHandle: string;
  statusMessages: StatusMessages;
}

export interface MenuCategory {
  id: string;
  slug: string;
  name: string;
  subtitle: string;
  sortOrder: number;
  isStar: boolean;
  layoutType: 'builder' | 'carousel' | 'mosaic' | 'list' | 'highlight';
}

export interface ProductOptionItem {
  id: string;
  name: string;
  price: number;
  available: boolean;
}

export interface ProductOptionGroup {
  id: string;
  title: string;
  required: boolean;
  minSelect: number;
  maxSelect: number | null;
  type: 'single' | 'multi' | 'quantity';
  items: ProductOptionItem[];
}

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  badge: string;
  available: boolean;
  sortOrder: number;
  alcoholWarning: boolean;
  optionGroups: ProductOptionGroup[];
}

export interface BuilderSize {
  id: string;
  name: string;
  kind: 'tigela' | 'copo';
  volume: string;
  price: number;
  includedCaldas: number;
  includedFrutas: number;
  includedGraos: number;
  includedCremes: number;
  extraPrice: number;
  available: boolean;
  isDoseDupla?: boolean;
  slogan?: string;
  badge?: string;
  description?: string;
  allowedCaldaIds?: string[];
}

export interface BuilderOptionItem {
  id: string;
  name: string;
  price: number;
  imageUrl?: string;
  available: boolean;
  color?: string;
}

export interface BuilderStep {
  id: 'acai' | 'creme' | 'calda' | 'fruta' | 'grao' | 'adicionais';
  title: string;
  subtitle: string;
  required: boolean;
  minSelect: number;
  includedCount: number;
  maxSelect: number | null;
  extraPrice: number;
  allowQuantity: boolean;
  items: BuilderOptionItem[];
}

export interface BuilderConfig {
  sizes: BuilderSize[];
  doseDupla: BuilderSize[];
  steps: BuilderStep[];
}

export interface CartItemSelection {
  groupTitle: string;
  items: { name: string; quantity: number; extraPrice: number }[];
}

export interface CartItem {
  id: string;
  productId: string;
  name: string;
  categoryName: string;
  isBuilder: boolean;
  unitPrice: number;
  quantity: number;
  notes: string;
  imageUrl?: string;
  selections: CartItemSelection[];
}

export interface OrderAddress {
  street: string;
  number: string;
  neighborhood: string;
  reference: string;
  lat?: number;
  lng?: number;
}

export interface Order {
  id: string;
  orderNumber: number;
  customerName: string;
  customerWhatsapp: string;
  deliveryType: DeliveryType;
  address: OrderAddress | null;
  paymentMethod: PaymentMethod;
  cashChangeFor: number | null;
  pixCode: string | null;
  pixReceiptUrl: string | null;
  pixReceiptName: string | null;
  pixConfirmed: boolean;
  items: CartItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  status: OrderStatus;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  active: boolean;
  createdAt: string;
}

export interface StoreCatalogResponse {
  settings: StoreSettings;
  categories: MenuCategory[];
  products: Product[];
  builderConfig: BuilderConfig;
  isOpenNow: boolean;
}

export interface AdminReports {
  todayRevenue: number;
  yesterdayRevenue: number;
  todayCount: number;
  yesterdayCount: number;
  averageTicket: number;
  topItems: { name: string; quantity: number; revenue: number }[];
  byPayment: { method: PaymentMethod; count: number; total: number }[];
  byHour: { hour: string; count: number; revenue: number }[];
}
