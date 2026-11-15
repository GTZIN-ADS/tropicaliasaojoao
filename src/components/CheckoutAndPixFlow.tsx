import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import confetti from 'canvas-confetti';
import {
  ArrowLeft,
  Banknote,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  FileUp,
  LocateFixed,
  MapPin,
  QrCode,
  Store,
  Truck,
  UploadCloud,
  X,
} from 'lucide-react';
import { CartItem, DeliveryType, Order, PaymentMethod, StoreSettings } from '../types';
import { apiRequest } from '../utils/api';
import { formatBRL, maskWhatsapp, normalizePhone } from '../utils/format';

interface CheckoutAndPixFlowProps {
  open: boolean;
  items: CartItem[];
  settings: StoreSettings;
  customerToken: string;
  onClose: () => void;
  onOrderCreated: (order: Order) => void;
  onReceiptUploaded: (order: Order) => void;
  onGoToTracking: (order: Order) => void;
}

const CHECKOUT_STEPS = ['Seus dados', 'Entrega', 'Pagamento', 'Confirmar'] as const;

export const CheckoutAndPixFlow: React.FC<CheckoutAndPixFlowProps> = ({
  open,
  items,
  settings,
  customerToken,
  onClose,
  onOrderCreated,
  onReceiptUploaded,
  onGoToTracking,
}) => {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('delivery');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [reference, setReference] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | undefined>(undefined);
  const [locating, setLocating] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [noChangeNeeded, setNoChangeNeeded] = useState(true);
  const [changeFor, setChangeFor] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Pix state after order creation
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copiedType, setCopiedType] = useState<'key' | 'code' | null>(null);
  const [toastMsg, setToastMsg] = useState('');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setCreatedOrder(null);
    setErrorMsg('');
    setUploadProgress(null);
    const savedName = localStorage.getItem('tropicalia_customer_name') || '';
    const savedPhone = localStorage.getItem('tropicalia_customer_whatsapp') || '';
    const savedAddr = localStorage.getItem('tropicalia_customer_address');
    if (savedName) setName(savedName);
    if (savedPhone) setWhatsapp(maskWhatsapp(savedPhone));
    if (savedAddr) {
      try {
        const parsed = JSON.parse(savedAddr);
        setStreet(parsed.street || '');
        setNumber(parsed.number || '');
        setNeighborhood(parsed.neighborhood || '');
        setReference(parsed.reference || '');
      } catch {
        // ignore
      }
    }
  }, [open]);

  useEffect(() => {
    if (!createdOrder?.pixCode) return;
    QRCode.toDataURL(createdOrder.pixCode, {
      width: 260,
      margin: 2,
      color: { dark: '#2E0A3A', light: '#FFF4DC' },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [createdOrder?.pixCode]);

  if (!open) return null;

  const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const deliveryFee = deliveryType === 'delivery' ? settings.deliveryFee : 0;
  const total = subtotal + deliveryFee;

  const handleUseLocation = () => {
    if (!navigator.geolocation) {
      setErrorMsg('Seu navegador não suporta localização automática.');
      return;
    }
    setLocating(true);
    setErrorMsg('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setCoords({ lat: latitude, lng: longitude });
        try {
          const resp = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`
          );
          if (resp.ok) {
            const data = await resp.json();
            const addr = data.address || {};
            if (addr.road) setStreet(addr.road);
            if (addr.house_number) setNumber(addr.house_number);
            if (addr.suburb || addr.neighbourhood || addr.quarter) {
              setNeighborhood(addr.suburb || addr.neighbourhood || addr.quarter);
            }
          }
        } catch {
          // GPS coordinates still attached even if reverse geocoding unavailable
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        setErrorMsg('Não foi possível obter o GPS. Preencha seu endereço manualmente.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const validateAndNext = () => {
    setErrorMsg('');
    if (step === 0) {
      if (!name.trim() || normalizePhone(whatsapp).length < 10) {
        setErrorMsg('Informe seu nome e WhatsApp com DDD para acompanhar seu pedido.');
        return;
      }
      localStorage.setItem('tropicalia_customer_name', name.trim());
      localStorage.setItem('tropicalia_customer_whatsapp', normalizePhone(whatsapp));
    }
    if (step === 1 && deliveryType === 'delivery') {
      if (!street.trim() || !number.trim() || !neighborhood.trim()) {
        setErrorMsg('Preencha rua, número e bairro para a entrega.');
        return;
      }
      localStorage.setItem(
        'tropicalia_customer_address',
        JSON.stringify({ street, number, neighborhood, reference })
      );
    }
    if (step === 2 && paymentMethod === 'cash' && !noChangeNeeded) {
      const val = Number(changeFor.replace(',', '.'));
      if (Number.isNaN(val) || val < total) {
        setErrorMsg(`O valor para troco deve ser maior ou igual a R$ ${formatBRL(total)}.`);
        return;
      }
    }
    setStep((s) => Math.min(CHECKOUT_STEPS.length - 1, s + 1));
  };

  const handlePlaceOrder = async () => {
    setSubmitting(true);
    setErrorMsg('');
    try {
      const cashChangeVal =
        paymentMethod === 'cash' && !noChangeNeeded ? Number(changeFor.replace(',', '.')) : null;

      const res = await apiRequest('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: name.trim(),
          customerWhatsapp: normalizePhone(whatsapp),
          customerToken,
          deliveryType,
          address:
            deliveryType === 'delivery'
              ? {
                  street: street.trim(),
                  number: number.trim(),
                  neighborhood: neighborhood.trim(),
                  reference: reference.trim(),
                  lat: coords?.lat,
                  lng: coords?.lng,
                }
              : null,
          paymentMethod,
          cashChangeFor: cashChangeVal,
          items,
        }),
      });

      let data: Order & { error?: string } | null = null;
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        data = (await res.json()) as Order & { error?: string };
      }
      if (!res.ok || !data) {
        setErrorMsg(data?.error || 'Não foi possível finalizar o pedido no servidor. Tente novamente.');
        return;
      }

      onOrderCreated(data);
      if (data.paymentMethod === 'pix') {
        setCreatedOrder(data);
      } else {
        onGoToTracking(data);
      }
    } catch {
      setErrorMsg('Falha na conexão. Verifique sua internet e tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyPix = async (type: 'key' | 'code', value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedType(type);
      setToastMsg('Copiado! Agora é só pagar no seu banco');
      if (navigator.vibrate) navigator.vibrate(40);
      confetti({
        particleCount: 38,
        spread: 60,
        origin: { y: 0.65 },
        colors: ['#F7B518', '#FFD45C', '#FFF4DC', '#62207A'],
      });
      setTimeout(() => setCopiedType(null), 2600);
      setTimeout(() => setToastMsg(''), 3400);
    } catch {
      setErrorMsg('Não foi possível copiar automaticamente. Selecione e copie o código.');
    }
  };

  const uploadReceiptFile = async (file: File) => {
    if (!createdOrder) return;
    setErrorMsg('');
    setUploadProgress(25);

    try {
      const formData = new FormData();
      formData.append('receipt', file);
      formData.append('customerToken', customerToken);

      setUploadProgress(65);
      const res = await apiRequest(`/api/orders/${createdOrder.id}/receipt`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const updated = (await res.json()) as Order;
        setUploadProgress(100);
        setCreatedOrder(updated);
        onReceiptUploaded(updated);
        confetti({
          particleCount: 45,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#3DDC84', '#F7B518', '#FFF4DC'],
        });
      } else {
        setUploadProgress(null);
        setErrorMsg('Arquivo inválido. Envie uma imagem (JPG, PNG, WEBP) ou PDF de até 10MB.');
      }
    } catch {
      setUploadProgress(null);
      setErrorMsg('Erro ao enviar comprovante. Tente novamente.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/75 backdrop-blur-sm p-0 md:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full md:max-w-2xl h-[94dvh] md:h-auto md:max-h-[90vh] bg-[#2E0A3A] text-[#FFF4DC] rounded-t-[28px] md:rounded-[28px] border border-[#62207A] shadow-2xl flex flex-col overflow-hidden">
        {/* Top Toast */}
        {toastMsg && (
          <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-full bg-[#3DDC84] text-[#2E0A3A] font-display font-bold text-sm shadow-xl flex items-center gap-2">
            <Check className="w-4 h-4 stroke-[3]" />
            {toastMsg}
          </div>
        )}

        {/* Header */}
        <div className="shrink-0 px-5 py-4 bg-[#4A1259] border-b border-[#62207A] flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-[#F7B518]">
              {createdOrder ? `Pedido #${createdOrder.orderNumber}` : `Etapa ${step + 1} de 4`}
            </p>
            <h2 className="font-display text-xl font-extrabold">
              {createdOrder ? 'Pagamento via Pix' : CHECKOUT_STEPS[step]}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar checkout"
            className="min-h-[44px] min-w-[44px] rounded-full bg-[#2E0A3A] flex items-center justify-center hover:bg-[#62207A] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Bar */}
        {!createdOrder && (
          <div className="shrink-0 px-5 pt-3 pb-1 flex gap-1.5">
            {CHECKOUT_STEPS.map((_, idx) => (
              <div
                key={idx}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  idx <= step ? 'bg-[#F7B518]' : 'bg-[#4A1259]'
                }`}
              />
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-[#FF6B5E]/20 border border-[#FF6B5E] text-sm font-semibold text-[#FFF4DC]">
              {errorMsg}
            </div>
          )}

          {/* PIX SCREEN AFTER ORDER CREATED */}
          {createdOrder ? (
            <div className="space-y-5">
              <div className="p-5 rounded-3xl bg-[#4A1259] border border-[#F7B518]/40 text-center space-y-3">
                <div className="text-xs font-bold text-[#FFF4DC]/75">Total a pagar no Pix</div>
                <div className="font-display text-4xl font-extrabold text-[#F7B518] tabular-nums">
                  <span className="text-lg mr-1">R$</span>
                  {formatBRL(createdOrder.total)}
                </div>
                {qrDataUrl && (
                  <div className="inline-block p-3 rounded-3xl bg-[#FFF4DC] shadow-xl">
                    <img src={qrDataUrl} alt="QR Code Pix Tropicália Açaí" className="w-44 h-44" />
                  </div>
                )}

                <div className="pt-2 space-y-2">
                  <div className="text-xs text-[#FFF4DC]/80">
                    Chave Pix (Telefone):{' '}
                    <span className="font-bold text-[#FFF4DC]">{settings.pixKeyDisplay}</span>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 justify-center">
                    <button
                      type="button"
                      onClick={() => handleCopyPix('key', settings.pixKeyDisplay)}
                      className={`min-h-[46px] px-5 rounded-full font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        copiedType === 'key'
                          ? 'bg-[#3DDC84] text-[#2E0A3A]'
                          : 'bg-[#2E0A3A] hover:bg-[#62207A] text-[#FFF4DC]'
                      }`}
                    >
                      {copiedType === 'key' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copiedType === 'key' ? 'Chave copiada!' : 'Copiar chave Pix'}
                    </button>

                    {createdOrder.pixCode && (
                      <button
                        type="button"
                        onClick={() => handleCopyPix('code', createdOrder.pixCode!)}
                        className={`min-h-[46px] px-5 rounded-full font-display font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                          copiedType === 'code'
                            ? 'bg-[#3DDC84] text-[#2E0A3A]'
                            : 'bg-[#F7B518] hover:bg-[#FFD45C] text-[#2E0A3A] shadow-lg shadow-[#F7B518]/25'
                        }`}
                      >
                        {copiedType === 'code' ? (
                          <Check className="w-4 h-4 stroke-[3]" />
                        ) : (
                          <QrCode className="w-4 h-4" />
                        )}
                        {copiedType === 'code' ? 'Código copiado!' : 'Copiar Pix copia e cola'}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* 3 Illustrated Steps */}
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { num: '1', title: 'Copie', desc: 'A chave ou código' },
                  { num: '2', title: 'Pague', desc: 'No app do seu banco' },
                  { num: '3', title: 'Envie', desc: 'O comprovante abaixo' },
                ].map((s) => (
                  <div key={s.num} className="p-3 rounded-2xl bg-[#4A1259]/75 border border-[#62207A]">
                    <div className="w-7 h-7 mx-auto mb-1 rounded-full bg-[#F7B518] text-[#2E0A3A] font-display font-bold text-sm flex items-center justify-center">
                      {s.num}
                    </div>
                    <div className="font-bold text-xs">{s.title}</div>
                    <div className="text-[11px] text-[#FFF4DC]/70">{s.desc}</div>
                  </div>
                ))}
              </div>

              {/* Receipt Upload Box */}
              <div className="space-y-3">
                <h3 className="font-display text-base font-bold">Enviar comprovante do Pix</h3>

                {createdOrder.pixReceiptUrl ? (
                  <div className="p-4 rounded-2xl bg-[#3DDC84]/15 border border-[#3DDC84] flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-7 h-7 text-[#3DDC84] shrink-0" />
                      <div>
                        <div className="font-bold text-sm text-[#FFF4DC]">
                          Comprovante enviado! A loja já vai conferir
                        </div>
                        <div className="text-xs text-[#FFF4DC]/75">
                          {createdOrder.pixReceiptName || 'Comprovante anexado'}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <label
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragging(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) uploadReceiptFile(file);
                    }}
                    className={`block p-6 rounded-3xl border-2 border-dashed text-center cursor-pointer transition-colors ${
                      dragging
                        ? 'border-[#F7B518] bg-[#62207A]/60'
                        : 'border-[#D58BAE]/60 bg-[#4A1259]/60 hover:border-[#F7B518]'
                    }`}
                  >
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadReceiptFile(file);
                      }}
                    />
                    <UploadCloud className="w-10 h-10 text-[#F7B518] mx-auto mb-2" />
                    <div className="font-display font-bold text-base">
                      Toque para enviar foto ou PDF do comprovante
                    </div>
                    <p className="text-xs text-[#FFF4DC]/70 mt-1">
                      Ou arraste o arquivo para cá · JPG, PNG, WEBP ou PDF
                    </p>

                    {uploadProgress !== null && (
                      <div className="mt-4 w-full max-w-xs mx-auto">
                        <div className="h-2 rounded-full bg-[#2E0A3A] overflow-hidden">
                          <div
                            className="h-full bg-[#3DDC84] transition-all"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                        <div className="text-xs font-bold text-[#3DDC84] mt-1">
                          Enviando... {uploadProgress}%
                        </div>
                      </div>
                    )}
                  </label>
                )}

                <button
                  type="button"
                  onClick={() => onGoToTracking(createdOrder)}
                  className="w-full min-h-[48px] rounded-full bg-[#F7B518] hover:bg-[#FFD45C] text-[#2E0A3A] font-display font-bold text-base cursor-pointer"
                >
                  Acompanhar meu pedido ao vivo
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* STEP 0: DADOS */}
              {step === 0 && (
                <div className="space-y-4">
                  <p className="text-sm text-[#FFF4DC]/80">
                    Não precisa criar conta. Seus dados ficam salvos neste aparelho para os próximos pedidos.
                  </p>
                  <div>
                    <label className="block text-sm font-bold mb-1.5">Seu Nome</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Como podemos te chamar?"
                      className="w-full min-h-[48px] rounded-2xl bg-[#4A1259] border border-[#62207A] focus:border-[#F7B518] focus:outline-none px-4 text-base text-[#FFF4DC]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-1.5">WhatsApp (com DDD)</label>
                    <input
                      type="tel"
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(maskWhatsapp(e.target.value))}
                      placeholder="(87) 99999-9999"
                      className="w-full min-h-[48px] rounded-2xl bg-[#4A1259] border border-[#62207A] focus:border-[#F7B518] focus:outline-none px-4 text-base text-[#FFF4DC] tabular-nums"
                    />
                  </div>
                </div>
              )}

              {/* STEP 1: ENTREGA OU RETIRADA */}
              {step === 1 && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setDeliveryType('delivery')}
                      className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                        deliveryType === 'delivery'
                          ? 'bg-[#62207A] border-[#F7B518]'
                          : 'bg-[#4A1259] border-transparent'
                      }`}
                    >
                      <Truck className="w-6 h-6 text-[#F7B518] mb-2" />
                      <div className="font-display font-bold text-base">Receber em casa</div>
                      <div className="text-xs text-[#FFF4DC]/75">
                        Taxa R$ {formatBRL(settings.deliveryFee)} · {settings.estimatedTime}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeliveryType('pickup')}
                      className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                        deliveryType === 'pickup'
                          ? 'bg-[#62207A] border-[#F7B518]'
                          : 'bg-[#4A1259] border-transparent'
                      }`}
                    >
                      <Store className="w-6 h-6 text-[#F7B518] mb-2" />
                      <div className="font-display font-bold text-base">Retirar no balcão</div>
                      <div className="text-xs text-[#3DDC84] font-bold">Taxa grátis (R$ 0,00)</div>
                    </button>
                  </div>

                  {deliveryType === 'delivery' ? (
                    <div className="space-y-3">
                      <button
                        type="button"
                        onClick={handleUseLocation}
                        disabled={locating}
                        className="w-full min-h-[46px] rounded-full bg-[#4A1259] hover:bg-[#62207A] border border-[#F7B518]/50 text-[#F7B518] font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <LocateFixed className={`w-4 h-4 ${locating ? 'animate-spin' : ''}`} />
                        {locating ? 'Localizando pelo GPS...' : 'Usar minha localização'}
                      </button>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-bold mb-1">Rua / Avenida</label>
                          <input
                            type="text"
                            value={street}
                            onChange={(e) => setStreet(e.target.value)}
                            placeholder="Ex: Av. Coronel Veremundo"
                            className="w-full min-h-[46px] rounded-2xl bg-[#4A1259] border border-[#62207A] focus:border-[#F7B518] focus:outline-none px-4 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold mb-1">Número</label>
                          <input
                            type="text"
                            value={number}
                            onChange={(e) => setNumber(e.target.value)}
                            placeholder="123"
                            className="w-full min-h-[46px] rounded-2xl bg-[#4A1259] border border-[#62207A] focus:border-[#F7B518] focus:outline-none px-4 text-sm"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold mb-1">Bairro</label>
                          <input
                            type="text"
                            value={neighborhood}
                            onChange={(e) => setNeighborhood(e.target.value)}
                            placeholder="Centro"
                            className="w-full min-h-[46px] rounded-2xl bg-[#4A1259] border border-[#62207A] focus:border-[#F7B518] focus:outline-none px-4 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold mb-1">Ponto de referência</label>
                          <input
                            type="text"
                            value={reference}
                            onChange={(e) => setReference(e.target.value)}
                            placeholder="Próximo à praça..."
                            className="w-full min-h-[46px] rounded-2xl bg-[#4A1259] border border-[#62207A] focus:border-[#F7B518] focus:outline-none px-4 text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-2xl bg-[#4A1259] border border-[#62207A] flex items-start gap-3">
                      <MapPin className="w-5 h-5 text-[#F7B518] shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold text-sm">Endereço para retirada</div>
                        <p className="text-sm text-[#FFF4DC]/80 mt-0.5">{settings.pickupAddress}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 2: PAGAMENTO */}
              {step === 2 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('pix')}
                      className={`p-4 rounded-2xl border-2 text-left flex items-center justify-between cursor-pointer transition-all ${
                        paymentMethod === 'pix'
                          ? 'bg-[#62207A] border-[#F7B518]'
                          : 'bg-[#4A1259] border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-[#F7B518]/20 text-[#F7B518] flex items-center justify-center">
                          <QrCode className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="font-display font-bold text-base">Pix (com comprovante)</div>
                          <div className="text-xs text-[#FFF4DC]/75">
                            QR Code + Copia e Cola na próxima tela
                          </div>
                        </div>
                      </div>
                      {paymentMethod === 'pix' && <Check className="w-5 h-5 text-[#F7B518]" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod('card')}
                      className={`p-4 rounded-2xl border-2 text-left flex items-center justify-between cursor-pointer transition-all ${
                        paymentMethod === 'card'
                          ? 'bg-[#62207A] border-[#F7B518]'
                          : 'bg-[#4A1259] border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-[#D58BAE]/20 text-[#D58BAE] flex items-center justify-center">
                          <CreditCard className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="font-display font-bold text-base">
                            Cartão na {deliveryType === 'delivery' ? 'entrega' : 'retirada'}
                          </div>
                          <div className="text-xs text-[#FFF4DC]/75">Crédito ou débito na maquininha</div>
                        </div>
                      </div>
                      {paymentMethod === 'card' && <Check className="w-5 h-5 text-[#F7B518]" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod('cash')}
                      className={`p-4 rounded-2xl border-2 text-left flex items-center justify-between cursor-pointer transition-all ${
                        paymentMethod === 'cash'
                          ? 'bg-[#62207A] border-[#F7B518]'
                          : 'bg-[#4A1259] border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-[#3DDC84]/20 text-[#3DDC84] flex items-center justify-center">
                          <Banknote className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="font-display font-bold text-base">Dinheiro</div>
                          <div className="text-xs text-[#FFF4DC]/75">Informe se precisa de troco</div>
                        </div>
                      </div>
                      {paymentMethod === 'cash' && <Check className="w-5 h-5 text-[#F7B518]" />}
                    </button>
                  </div>

                  {paymentMethod === 'cash' && (
                    <div className="p-4 rounded-2xl bg-[#4A1259] border border-[#62207A] space-y-3">
                      <label className="flex items-center gap-2.5 text-sm font-bold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={noChangeNeeded}
                          onChange={(e) => setNoChangeNeeded(e.target.checked)}
                          className="w-4 h-4 accent-[#F7B518]"
                        />
                        Não preciso de troco
                      </label>
                      {!noChangeNeeded && (
                        <div>
                          <label className="block text-xs font-bold mb-1">
                            Troco para quanto? (Total: R$ {formatBRL(total)})
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={changeFor}
                            onChange={(e) => setChangeFor(e.target.value)}
                            placeholder="Ex: 50,00"
                            className="w-full min-h-[44px] rounded-2xl bg-[#2E0A3A] border border-[#62207A] focus:border-[#F7B518] focus:outline-none px-4 text-sm"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* STEP 3: REVISÃO */}
              {step === 3 && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-[#4A1259] border border-[#62207A] space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-[#FFF4DC]/75">Cliente</span>
                      <span className="font-bold">
                        {name} · {whatsapp}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-[#FFF4DC]/75">Entrega</span>
                      <span className="font-semibold text-right">
                        {deliveryType === 'delivery'
                          ? `${street}, ${number} - ${neighborhood}`
                          : 'Retirar no balcão'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#FFF4DC]/75">Pagamento</span>
                      <span className="font-bold text-[#F7B518]">
                        {paymentMethod === 'pix'
                          ? 'Pix (enviar comprovante)'
                          : paymentMethod === 'card'
                          ? 'Cartão na entrega'
                          : noChangeNeeded
                          ? 'Dinheiro (sem troco)'
                          : `Dinheiro (troco para R$ ${changeFor})`}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-[#4A1259] border border-[#62207A] space-y-2">
                    <div className="font-display font-bold text-sm text-[#F7B518]">
                      Itens ({items.reduce((a, b) => a + b.quantity, 0)})
                    </div>
                    {items.map((item) => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span>
                          {item.quantity}x {item.name}
                        </span>
                        <span className="font-bold tabular-nums">
                          R$ {formatBRL(item.unitPrice * item.quantity)}
                        </span>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-[#62207A] space-y-1 text-sm">
                      <div className="flex justify-between text-[#FFF4DC]/75">
                        <span>Subtotal</span>
                        <span className="tabular-nums">R$ {formatBRL(subtotal)}</span>
                      </div>
                      <div className="flex justify-between text-[#FFF4DC]/75">
                        <span>Taxa de entrega</span>
                        <span className="tabular-nums">R$ {formatBRL(deliveryFee)}</span>
                      </div>
                      <div className="flex justify-between text-base font-display font-extrabold text-[#F7B518]">
                        <span>Total</span>
                        <span className="tabular-nums">R$ {formatBRL(total)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Bottom Navigation */}
        {!createdOrder && (
          <div className="shrink-0 px-5 py-4 bg-[#4A1259] border-t border-[#62207A] flex items-center justify-between gap-3">
            {step > 0 ? (
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                className="min-h-[48px] px-4 rounded-full bg-[#2E0A3A] text-[#FFF4DC] font-bold text-sm flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar
              </button>
            ) : (
              <div className="text-sm font-display font-bold text-[#F7B518] tabular-nums">
                Total: R$ {formatBRL(total)}
              </div>
            )}

            {step < CHECKOUT_STEPS.length - 1 ? (
              <button
                type="button"
                onClick={validateAndNext}
                className="min-h-[48px] px-6 rounded-full bg-[#F7B518] hover:bg-[#FFD45C] text-[#2E0A3A] font-display font-bold text-base cursor-pointer"
              >
                Continuar
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting}
                onClick={handlePlaceOrder}
                className="min-h-[48px] px-6 rounded-full bg-[#F7B518] hover:bg-[#FFD45C] disabled:opacity-50 text-[#2E0A3A] font-display font-bold text-base shadow-lg shadow-[#F7B518]/25 flex items-center gap-2 cursor-pointer"
              >
                <FileUp className="w-4 h-4" />
                {submitting ? 'Enviando pedido...' : 'Confirmar pedido'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
