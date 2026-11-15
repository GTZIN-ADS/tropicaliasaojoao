import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  Bike,
  Check,
  ChefHat,
  Clock,
  MessageCircle,
  PackageCheck,
  Sparkles,
  UploadCloud,
  Volume2,
  X,
  XCircle,
} from 'lucide-react';
import { Order, OrderStatus, StoreSettings } from '../types';
import { apiRequest } from '../utils/api';
import { formatBRL, maskWhatsapp, normalizePhone } from '../utils/format';

interface OrderTrackingViewProps {
  open: boolean;
  orders: Order[];
  activeOrder: Order | null;
  settings: StoreSettings;
  customerToken: string;
  onSelectOrder: (order: Order) => void;
  onClose: () => void;
  onRefreshOrders: (whatsapp?: string) => void;
  onReceiptUploaded: (order: Order) => void;
}

const TIMELINE_STEPS: {
  key: OrderStatus;
  label: string;
  pickupLabel?: string;
}[] = [
  { key: 'pending', label: 'Aguardando confirmação' },
  { key: 'preparing', label: 'Em preparo' },
  { key: 'ready', label: 'Pronto', pickupLabel: 'Pronto para retirar' },
  { key: 'out_for_delivery', label: 'Saiu para entrega' },
  { key: 'delivered', label: 'Entregue' },
];

function getStepIndex(status: OrderStatus): number {
  if (status === 'awaiting_payment') return 0;
  const idx = TIMELINE_STEPS.findIndex((s) => s.key === status);
  return idx === -1 ? 0 : idx;
}

export const OrderTrackingView: React.FC<OrderTrackingViewProps> = ({
  open,
  orders,
  activeOrder,
  settings,
  customerToken,
  onSelectOrder,
  onClose,
  onRefreshOrders,
  onReceiptUploaded,
}) => {
  const [filterName, setFilterName] = useState(
    () => localStorage.getItem('tropicalia_customer_name') || ''
  );
  const [filterWhatsapp, setFilterWhatsapp] = useState(() =>
    maskWhatsapp(localStorage.getItem('tropicalia_customer_whatsapp') || '')
  );
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (activeOrder?.status === 'delivered') {
      confetti({
        particleCount: 55,
        spread: 75,
        origin: { y: 0.6 },
        colors: ['#F7B518', '#3DDC84', '#FFF4DC', '#D58BAE'],
      });
    }
  }, [activeOrder?.status]);

  if (!open) return null;

  const current = activeOrder || orders[0] || null;
  const activeStepIdx = current ? getStepIndex(current.status) : 0;

  const getStatusMessage = (order: Order): string => {
    const msgs = settings.statusMessages;
    if (order.status === 'awaiting_payment') return msgs.awaiting_payment;
    if (order.status === 'pending') return msgs.pending;
    if (order.status === 'preparing') return msgs.preparing;
    if (order.status === 'ready') {
      return order.deliveryType === 'pickup' ? msgs.ready_pickup : msgs.ready;
    }
    if (order.status === 'out_for_delivery') return msgs.out_for_delivery;
    if (order.status === 'delivered') return msgs.delivered;
    return order.cancelReason || msgs.cancelled;
  };

  const handleUploadReceipt = async (file: File) => {
    if (!current) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('receipt', file);
      formData.append('customerToken', customerToken);
      const res = await apiRequest(`/api/orders/${current.id}/receipt`, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const updated = (await res.json()) as Order;
        onReceiptUploaded(updated);
      }
    } finally {
      setUploading(false);
    }
  };

  const whatsappUrl = current
    ? `https://wa.me/${settings.whatsappNumber}?text=${encodeURIComponent(
        `Olá Tropicália Açaí! Sou ${current.customerName} e estou acompanhando meu pedido #${current.orderNumber}.`
      )}`
    : `https://wa.me/${settings.whatsappNumber}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/75 backdrop-blur-sm p-0 md:p-6"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full md:max-w-4xl h-[94dvh] md:h-[88vh] bg-[#2E0A3A] text-[#FFF4DC] rounded-t-[28px] md:rounded-[28px] border border-[#62207A] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="shrink-0 px-5 py-4 bg-[#4A1259] border-b border-[#62207A] flex items-center justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#F7B518]">
              <span>Tempo real · {settings.estimatedTime}</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#3DDC84]/15 text-[#3DDC84] text-[10px]">
                <Volume2 className="w-3 h-3" />
                Som sempre ativo
              </span>
            </div>
            <h2 className="font-display text-xl sm:text-2xl font-extrabold mt-0.5">
              {current ? `Pedido #${current.orderNumber}` : 'Meus Pedidos'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar acompanhamento"
            className="min-h-[44px] min-w-[44px] rounded-full bg-[#2E0A3A] flex items-center justify-center hover:bg-[#62207A] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col md:grid md:grid-cols-12 overflow-hidden">
          {/* Left: Order History on this device */}
          <div className="md:col-span-4 border-b md:border-b-0 md:border-r border-[#62207A] bg-[#4A1259]/35 p-4 space-y-3 overflow-y-auto max-h-56 md:max-h-none">
            <div className="space-y-2">
              <div className="text-xs font-bold text-[#F7B518]">Seus pedidos neste aparelho</div>
              <div className="grid grid-cols-1 gap-2">
                <input
                  type="text"
                  value={filterName}
                  onChange={(e) => {
                    setFilterName(e.target.value);
                    localStorage.setItem('tropicalia_customer_name', e.target.value);
                  }}
                  placeholder="Seu nome"
                  className="w-full rounded-xl bg-[#2E0A3A] border border-[#62207A] px-3 py-2 text-xs text-[#FFF4DC]"
                />
                <div className="flex gap-1.5">
                  <input
                    type="tel"
                    value={filterWhatsapp}
                    onChange={(e) => setFilterWhatsapp(maskWhatsapp(e.target.value))}
                    placeholder="WhatsApp"
                    className="flex-1 rounded-xl bg-[#2E0A3A] border border-[#62207A] px-3 py-2 text-xs text-[#FFF4DC] tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() => onRefreshOrders(normalizePhone(filterWhatsapp))}
                    className="px-3 rounded-xl bg-[#F7B518] text-[#2E0A3A] text-xs font-bold cursor-pointer"
                  >
                    Buscar
                  </button>
                </div>
              </div>
            </div>

            {orders.length === 0 ? (
              <p className="text-xs text-[#FFF4DC]/65 py-3">
                Nenhum pedido encontrado neste aparelho ainda.
              </p>
            ) : (
              <div className="space-y-2">
                {orders.map((ord) => (
                  <button
                    key={ord.id}
                    type="button"
                    onClick={() => onSelectOrder(ord)}
                    className={`w-full text-left p-3 rounded-2xl border transition-all cursor-pointer ${
                      current?.id === ord.id
                        ? 'bg-[#62207A] border-[#F7B518]'
                        : 'bg-[#4A1259]/70 border-transparent hover:border-[#D58BAE]/40'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span>Pedido #{ord.orderNumber}</span>
                      <span className="text-[#F7B518] tabular-nums">R$ {formatBRL(ord.total)}</span>
                    </div>
                    <div className="text-[11px] text-[#FFF4DC]/70 mt-1">
                      {new Date(ord.createdAt).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      · {ord.status === 'cancelled' ? 'Cancelado' : TIMELINE_STEPS[getStepIndex(ord.status)]?.label}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: Live Timeline */}
          <div className="flex-1 md:col-span-8 overflow-y-auto p-5 space-y-6">
            {!current ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-12 space-y-2">
                <Clock className="w-10 h-10 text-[#F7B518]" />
                <p className="font-display text-lg font-bold">Monte seu pedido para acompanhar aqui!</p>
              </div>
            ) : (
              <>
                {/* Live Status Card */}
                {current.status === 'cancelled' ? (
                  <div className="p-5 rounded-3xl bg-[#FF6B5E]/15 border border-[#FF6B5E]/60 flex items-start gap-4">
                    <XCircle className="w-8 h-8 text-[#FF6B5E] shrink-0" />
                    <div>
                      <h3 className="font-display text-lg font-bold text-[#FFF4DC]">
                        Pedido não pôde continuar
                      </h3>
                      <p className="text-sm text-[#FFF4DC]/85 mt-1">{getStatusMessage(current)}</p>
                    </div>
                  </div>
                ) : (
                  <div className="p-5 rounded-3xl bg-[#4A1259] border border-[#F7B518]/40 space-y-5">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-[#F7B518]/20 text-[#F7B518] flex items-center justify-center shrink-0">
                        {current.status === 'preparing' ? (
                          <ChefHat className="w-6 h-6 animate-bounce" />
                        ) : current.status === 'out_for_delivery' ? (
                          <Bike className="w-6 h-6 animate-pulse" />
                        ) : current.status === 'delivered' ? (
                          <Sparkles className="w-6 h-6" />
                        ) : (
                          <Clock className="w-6 h-6 animate-pulse" />
                        )}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-[#F7B518]">Status ao vivo</div>
                        <p className="font-display text-lg sm:text-xl font-extrabold text-[#FFF4DC]">
                          {getStatusMessage(current)}
                        </p>
                      </div>
                    </div>

                    {/* Desktop Horizontal / Mobile Vertical Timeline */}
                    <div className="flex flex-col md:flex-row md:items-start gap-3 md:gap-2">
                      {TIMELINE_STEPS.filter((s) =>
                        current.deliveryType === 'pickup' ? s.key !== 'out_for_delivery' : true
                      ).map((stepItem, idx, arr) => {
                        const realIdx = TIMELINE_STEPS.findIndex((x) => x.key === stepItem.key);
                        const done = activeStepIdx > realIdx || current.status === 'delivered';
                        const active = activeStepIdx === realIdx && current.status !== 'delivered';
                        const label =
                          current.deliveryType === 'pickup' && stepItem.pickupLabel
                            ? stepItem.pickupLabel
                            : stepItem.label;

                        return (
                          <div
                            key={stepItem.key}
                            className="flex md:flex-col items-center md:flex-1 gap-3 md:gap-2 relative"
                          >
                            <div
                              className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 transition-all ${
                                done
                                  ? 'bg-[#3DDC84] text-[#2E0A3A]'
                                  : active
                                  ? 'bg-[#F7B518] text-[#2E0A3A] shadow-lg shadow-[#F7B518]/40 ring-4 ring-[#F7B518]/25'
                                  : 'bg-[#2E0A3A] text-[#FFF4DC]/40 border border-[#62207A]'
                              }`}
                            >
                              {done ? <Check className="w-4 h-4 stroke-[3]" /> : idx + 1}
                            </div>
                            <span
                              className={`text-xs md:text-center font-bold ${
                                done || active ? 'text-[#FFF4DC]' : 'text-[#FFF4DC]/45'
                              }`}
                            >
                              {label}
                            </span>
                            {idx < arr.length - 1 && (
                              <div className="hidden md:block flex-1 h-0.5 w-full bg-[#62207A] mt-4" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Pending Pix Receipt Upload Prompt */}
                {current.paymentMethod === 'pix' && !current.pixReceiptUrl && current.status !== 'cancelled' && (
                  <div className="p-4 rounded-2xl bg-[#F7B518]/15 border border-[#F7B518] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <div className="font-bold text-sm text-[#F7B518]">
                        Falta enviar o comprovante do Pix
                      </div>
                      <div className="text-xs text-[#FFF4DC]/80">
                        Chave Pix: {settings.pixKeyDisplay} · Total R$ {formatBRL(current.total)}
                      </div>
                    </div>
                    <label className="min-h-[42px] px-4 rounded-full bg-[#F7B518] text-[#2E0A3A] font-bold text-xs flex items-center gap-1.5 cursor-pointer shrink-0">
                      <UploadCloud className="w-4 h-4" />
                      {uploading ? 'Enviando...' : 'Enviar comprovante'}
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleUploadReceipt(f);
                        }}
                      />
                    </label>
                  </div>
                )}

                {/* Order Summary */}
                <div className="p-4 rounded-3xl bg-[#4A1259]/75 border border-[#62207A] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-display font-bold text-base flex items-center gap-2">
                      <PackageCheck className="w-5 h-5 text-[#F7B518]" />
                      Resumo do pedido
                    </span>
                    <span className="text-xs text-[#FFF4DC]/70">
                      {new Date(current.createdAt).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  <div className="space-y-2 text-sm">
                    {current.items.map((item) => (
                      <div key={item.id} className="pb-2 border-b border-[#62207A]/60 last:border-0">
                        <div className="flex justify-between font-bold">
                          <span>
                            {item.quantity}x {item.name}
                          </span>
                          <span className="tabular-nums">
                            R$ {formatBRL(item.unitPrice * item.quantity)}
                          </span>
                        </div>
                        {item.selections.length > 0 && (
                          <div className="text-xs text-[#FFF4DC]/70 mt-0.5">
                            {item.selections
                              .map((s) => `${s.groupTitle}: ${s.items.map((i) => i.name).join(', ')}`)
                              .join(' · ')}
                          </div>
                        )}
                        {item.notes && (
                          <div className="text-xs text-[#FFD45C] italic mt-0.5">Obs: {item.notes}</div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-[#62207A] flex justify-between font-display font-extrabold text-base text-[#F7B518]">
                    <span>Total ({current.paymentMethod.toUpperCase()})</span>
                    <span className="tabular-nums">R$ {formatBRL(current.total)}</span>
                  </div>
                </div>

                {/* WhatsApp Store Contact */}
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full min-h-[48px] rounded-full bg-[#3DDC84] hover:bg-[#52E896] text-[#2E0A3A] font-display font-bold text-sm flex items-center justify-center gap-2 transition-colors"
                >
                  <MessageCircle className="w-5 h-5" />
                  Falar com a loja no WhatsApp (87) 98148-3783
                </a>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
