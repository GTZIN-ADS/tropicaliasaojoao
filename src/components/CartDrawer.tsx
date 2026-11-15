import React from 'react';
import { Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { CartItem } from '../types';
import { formatBRL } from '../utils/format';

interface CartDrawerProps {
  open: boolean;
  items: CartItem[];
  deliveryFee: number;
  isStoreOpen: boolean;
  onClose: () => void;
  onUpdateQty: (id: string, delta: number) => void;
  onRemoveItem: (id: string) => void;
  onCheckout: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  open,
  items,
  deliveryFee,
  isStoreOpen,
  onClose,
  onUpdateQty,
  onRemoveItem,
  onCheckout,
}) => {
  if (!open) return null;

  const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const totalWithDelivery = subtotal + (items.length > 0 ? deliveryFee : 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-stretch md:justify-end bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Sacola de compras"
    >
      <div className="w-full md:w-[440px] h-[90dvh] md:h-full bg-[#2E0A3A] text-[#FFF4DC] rounded-t-[28px] md:rounded-none md:rounded-l-[28px] border-t md:border-l border-[#62207A] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="shrink-0 px-5 py-4 bg-[#4A1259] border-b border-[#62207A] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="w-5 h-5 text-[#F7B518]" />
            <h2 className="font-display text-xl font-extrabold">Seu Carrinho</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar carrinho"
            className="min-h-[44px] min-w-[44px] rounded-full bg-[#2E0A3A] flex items-center justify-center hover:bg-[#62207A] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-12 space-y-3">
              <div className="w-16 h-16 rounded-full bg-[#4A1259] flex items-center justify-center text-[#F7B518]">
                <ShoppingBag className="w-8 h-8" />
              </div>
              <p className="font-display text-lg font-bold">Seu carrinho está vazio</p>
              <p className="text-sm text-[#FFF4DC]/70 max-w-xs">
                Escolha um tamanho de açaí montável ou explore nossas tigelinhas, sorvetes e lanches.
              </p>
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-2xl bg-[#4A1259] border border-[#62207A] space-y-2.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-bold text-[#D58BAE]">{item.categoryName}</div>
                    <h3 className="font-display text-base font-bold text-[#FFF4DC]">{item.name}</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveItem(item.id)}
                    aria-label={`Remover ${item.name}`}
                    className="p-2 rounded-full hover:bg-[#FF6B5E]/20 text-[#FFF4DC]/65 hover:text-[#FF6B5E] cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {item.selections.length > 0 && (
                  <div className="space-y-1 text-xs text-[#FFF4DC]/80 bg-[#2E0A3A]/55 rounded-xl p-2.5">
                    {item.selections.map((sel, idx) => (
                      <div key={idx}>
                        <span className="font-bold text-[#F7B518]">{sel.groupTitle}: </span>
                        <span>
                          {sel.items
                            .map((i) => (i.quantity > 1 ? `${i.quantity}x ${i.name}` : i.name))
                            .join(', ')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {item.notes && (
                  <p className="text-xs italic text-[#FFD45C]">Obs: {item.notes}</p>
                )}

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2 bg-[#2E0A3A] rounded-full px-1.5 py-1">
                    <button
                      type="button"
                      onClick={() => onUpdateQty(item.id, -1)}
                      className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#62207A] cursor-pointer"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-5 text-center font-bold text-sm tabular-nums">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => onUpdateQty(item.id, 1)}
                      className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#62207A] cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <span className="font-display text-lg font-bold text-[#F7B518] tabular-nums">
                    <span className="text-xs mr-0.5">R$</span>
                    {formatBRL(item.unitPrice * item.quantity)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Totals */}
        {items.length > 0 && (
          <div className="shrink-0 p-5 bg-[#4A1259] border-t border-[#62207A] space-y-3">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-[#FFF4DC]/80">
                <span>Subtotal</span>
                <span className="font-bold tabular-nums">R$ {formatBRL(subtotal)}</span>
              </div>
              <div className="flex justify-between text-[#FFF4DC]/80">
                <span>Taxa de entrega (fixa)</span>
                <span className="font-bold tabular-nums">R$ {formatBRL(deliveryFee)}</span>
              </div>
              <div className="flex justify-between text-base pt-1.5 border-t border-[#62207A]">
                <span className="font-display font-bold">Total estimado</span>
                <span className="font-display text-xl font-extrabold text-[#F7B518] tabular-nums">
                  R$ {formatBRL(totalWithDelivery)}
                </span>
              </div>
              <p className="text-[11px] text-[#FFF4DC]/65">
                Sem pedido mínimo · Se optar por retirar no balcão, a taxa é R$ 0,00.
              </p>
            </div>

            {!isStoreOpen && (
              <div className="p-3 rounded-2xl bg-[#FF6B5E]/20 border border-[#FF6B5E] text-xs font-bold text-[#FFF4DC] text-center">
                A loja está fechada agora. Volte no nosso horário de funcionamento para enviar o pedido.
              </div>
            )}

            <button
              type="button"
              disabled={!isStoreOpen}
              onClick={onCheckout}
              className="w-full min-h-[50px] rounded-full bg-[#F7B518] hover:bg-[#FFD45C] disabled:opacity-45 disabled:cursor-not-allowed text-[#2E0A3A] font-display font-bold text-base shadow-lg shadow-[#F7B518]/25 transition-transform active:scale-95 cursor-pointer"
            >
              Finalizar pedido
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
