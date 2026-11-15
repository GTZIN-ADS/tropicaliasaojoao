import React, { useEffect, useMemo, useState } from 'react';
import { Check, Minus, Plus, Search, ShoppingBag, TriangleAlert, X } from 'lucide-react';
import { CartItem, CartItemSelection, Product } from '../types';
import { formatBRL } from '../utils/format';
import { ProductBrandArtwork } from './TropicalArtwork';

interface ProductOptionsSheetProps {
  product: Product | null;
  categoryName: string;
  onClose: () => void;
  onAddToCart: (item: CartItem) => void;
}

export const ProductOptionsSheet: React.FC<ProductOptionsSheetProps> = ({
  product,
  categoryName,
  onClose,
  onAddToCart,
}) => {
  const [singleChoice, setSingleChoice] = useState<Record<string, string>>({});
  const [multiChoice, setMultiChoice] = useState<Record<string, string[]>>({});
  const [qtyChoice, setQtyChoice] = useState<Record<string, Record<string, number>>>({});
  const [searchTerms, setSearchTerms] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [validationMsg, setValidationMsg] = useState('');

  useEffect(() => {
    if (!product) return;
    const initSingle: Record<string, string> = {};
    const initMulti: Record<string, string[]> = {};
    for (const g of product.optionGroups) {
      const avail = g.items.filter((i) => i.available);
      if (g.type === 'single' && g.required && avail.length > 0) {
        initSingle[g.id] = avail[0].id;
      } else if (g.type === 'multi') {
        initMulti[g.id] = [];
      }
    }
    setSingleChoice(initSingle);
    setMultiChoice(initMulti);
    setQtyChoice({});
    setSearchTerms({});
    setNotes('');
    setQuantity(1);
    setValidationMsg('');
  }, [product]);

  const extrasTotal = useMemo(() => {
    if (!product) return 0;
    let sum = 0;
    for (const g of product.optionGroups) {
      if (g.type === 'single') {
        const picked = g.items.find((i) => i.id === singleChoice[g.id]);
        if (picked) sum += picked.price;
      } else if (g.type === 'multi') {
        for (const id of multiChoice[g.id] || []) {
          const picked = g.items.find((i) => i.id === id);
          if (picked) sum += picked.price;
        }
      } else if (g.type === 'quantity') {
        const groupMap = qtyChoice[g.id] || {};
        for (const [id, q] of Object.entries(groupMap)) {
          if (q > 0) {
            const picked = g.items.find((i) => i.id === id);
            if (picked) sum += picked.price * q;
          }
        }
      }
    }
    return sum;
  }, [product, singleChoice, multiChoice, qtyChoice]);

  if (!product) return null;

  const unitPrice = Number((product.price + extrasTotal).toFixed(2));

  const toggleMulti = (groupId: string, itemId: string, maxSelect: number | null) => {
    setMultiChoice((prev) => {
      const curr = prev[groupId] || [];
      if (curr.includes(itemId)) {
        return { ...prev, [groupId]: curr.filter((x) => x !== itemId) };
      }
      if (maxSelect && curr.length >= maxSelect) {
        return { ...prev, [groupId]: [...curr.slice(1), itemId] };
      }
      return { ...prev, [groupId]: [...curr, itemId] };
    });
  };

  const changeQty = (groupId: string, itemId: string, delta: number) => {
    setQtyChoice((prev) => {
      const groupMap = prev[groupId] || {};
      const next = Math.max(0, (groupMap[itemId] || 0) + delta);
      return { ...prev, [groupId]: { ...groupMap, [itemId]: next } };
    });
  };

  const handleConfirm = () => {
    for (const g of product.optionGroups) {
      if (g.required) {
        if (g.type === 'single' && !singleChoice[g.id]) {
          setValidationMsg(`Por favor, selecione uma opção em "${g.title}".`);
          return;
        }
        if (g.type === 'multi' && (multiChoice[g.id]?.length || 0) < g.minSelect) {
          setValidationMsg(`Escolha pelo menos ${g.minSelect} opção em "${g.title}".`);
          return;
        }
      }
    }

    const selections: CartItemSelection[] = [];
    for (const g of product.optionGroups) {
      if (g.type === 'single') {
        const picked = g.items.find((i) => i.id === singleChoice[g.id]);
        if (picked) {
          selections.push({
            groupTitle: g.title,
            items: [{ name: picked.name, quantity: 1, extraPrice: picked.price }],
          });
        }
      } else if (g.type === 'multi') {
        const pickedIds = multiChoice[g.id] || [];
        if (pickedIds.length > 0) {
          selections.push({
            groupTitle: g.title,
            items: pickedIds
              .map((id) => g.items.find((i) => i.id === id))
              .filter(Boolean)
              .map((i) => ({ name: i!.name, quantity: 1, extraPrice: i!.price })),
          });
        }
      } else if (g.type === 'quantity') {
        const groupMap = qtyChoice[g.id] || {};
        const list = Object.entries(groupMap)
          .filter(([, q]) => q > 0)
          .map(([id, q]) => {
            const found = g.items.find((i) => i.id === id);
            return found ? { name: found.name, quantity: q, extraPrice: found.price * q } : null;
          })
          .filter(Boolean) as { name: string; quantity: number; extraPrice: number }[];
        if (list.length > 0) {
          selections.push({ groupTitle: g.title, items: list });
        }
      }
    }

    onAddToCart({
      id: `prod-${product.id}-${Date.now()}`,
      productId: product.id,
      name: product.name,
      categoryName,
      isBuilder: false,
      unitPrice,
      quantity,
      notes: notes.trim(),
      imageUrl: product.imageUrl,
      selections,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center md:justify-end bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full md:w-[500px] h-[92dvh] md:h-full bg-[#2E0A3A] text-[#FFF4DC] rounded-t-[28px] md:rounded-none md:rounded-l-[28px] border-t md:border-l border-[#62207A] flex flex-col overflow-hidden shadow-2xl">
        {/* Top media & title */}
        <div className="shrink-0 relative">
          <div className="h-44 w-full relative overflow-hidden">
            <ProductBrandArtwork
              categoryId={product.categoryId}
              name={product.name}
              imageUrl={product.imageUrl}
              className="w-full h-full"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#2E0A3A] via-[#2E0A3A]/35 to-transparent" />
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar detalhes"
              className="absolute top-4 right-4 min-h-[44px] min-w-[44px] rounded-full bg-[#2E0A3A]/85 text-[#FFF4DC] flex items-center justify-center hover:bg-[#4A1259] cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="px-5 pb-4 -mt-8 relative">
            <div className="text-xs font-bold text-[#F7B518]">{categoryName}</div>
            <h2 className="font-display text-2xl font-extrabold text-[#FFF4DC]">{product.name}</h2>
            <p className="text-sm text-[#FFF4DC]/75 mt-1">{product.description}</p>
            {product.alcoholWarning && (
              <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-[#FFD45C] bg-[#4A1259] px-3 py-1 rounded-full">
                <TriangleAlert className="w-3.5 h-3.5 text-[#FF6B5E]" />
                Venda proibida para menores de 18 anos
              </div>
            )}
          </div>
        </div>

        {/* Option Groups */}
        <div className="flex-1 overflow-y-auto px-5 pb-6 space-y-6">
          {validationMsg && (
            <div className="p-3 rounded-2xl bg-[#FF6B5E]/20 border border-[#FF6B5E] text-xs font-bold text-[#FFF4DC]">
              {validationMsg}
            </div>
          )}

          {product.optionGroups.map((group) => {
            const availItems = group.items.filter((i) => i.available);
            const showSearch = availItems.length > 10;
            const query = (searchTerms[group.id] || '').toLowerCase();
            const filtered = query
              ? availItems.filter((i) => i.name.toLowerCase().includes(query))
              : availItems;

            return (
              <div key={group.id} className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-base font-bold text-[#FFF4DC]">{group.title}</h3>
                  <span className="text-xs font-bold text-[#F7B518]">
                    {group.required ? 'Obrigatório' : 'Opcional'}
                  </span>
                </div>

                {showSearch && (
                  <div className="relative">
                    <Search className="w-4 h-4 text-[#FFF4DC]/50 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchTerms[group.id] || ''}
                      onChange={(e) =>
                        setSearchTerms((prev) => ({ ...prev, [group.id]: e.target.value }))
                      }
                      placeholder="Buscar sabor ou ingrediente..."
                      className="w-full rounded-full bg-[#4A1259] border border-[#62207A] focus:border-[#F7B518] focus:outline-none pl-10 pr-4 py-2 text-sm text-[#FFF4DC] placeholder:text-[#FFF4DC]/45"
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {filtered.map((item) => {
                    if (group.type === 'single') {
                      const active = singleChoice[group.id] === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setValidationMsg('');
                            setSingleChoice((prev) => ({ ...prev, [group.id]: item.id }));
                          }}
                          className={`p-3 rounded-2xl border text-left flex items-center justify-between gap-2 cursor-pointer transition-all ${
                            active
                              ? 'bg-[#62207A] border-[#F7B518]'
                              : 'bg-[#4A1259]/75 border-transparent hover:border-[#D58BAE]/40'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="font-semibold text-sm truncate">{item.name}</div>
                            {item.price > 0 && (
                              <div className="text-xs text-[#F7B518] font-bold tabular-nums">
                                + R$ {formatBRL(item.price)}
                              </div>
                            )}
                          </div>
                          {active && <Check className="w-4 h-4 text-[#F7B518] shrink-0" />}
                        </button>
                      );
                    }

                    if (group.type === 'multi') {
                      const selectedList = multiChoice[group.id] || [];
                      const active = selectedList.includes(item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setValidationMsg('');
                            toggleMulti(group.id, item.id, group.maxSelect);
                          }}
                          className={`p-3 rounded-2xl border text-left flex items-center justify-between gap-2 cursor-pointer transition-all ${
                            active
                              ? 'bg-[#62207A] border-[#F7B518]'
                              : 'bg-[#4A1259]/75 border-transparent hover:border-[#D58BAE]/40'
                          }`}
                        >
                          <span className="font-semibold text-sm truncate">{item.name}</span>
                          {active && <Check className="w-4 h-4 text-[#F7B518] shrink-0" />}
                        </button>
                      );
                    }

                    const qty = qtyChoice[group.id]?.[item.id] || 0;
                    return (
                      <div
                        key={item.id}
                        className={`p-3 rounded-2xl border flex items-center justify-between gap-2 ${
                          qty > 0 ? 'bg-[#62207A] border-[#F7B518]' : 'bg-[#4A1259]/75 border-transparent'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-xs sm:text-sm truncate">{item.name}</div>
                          <div className="text-xs text-[#F7B518] font-bold tabular-nums">
                            + R$ {formatBRL(item.price)}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => changeQty(group.id, item.id, -1)}
                            disabled={qty === 0}
                            className="w-8 h-8 rounded-full bg-[#2E0A3A] flex items-center justify-center disabled:opacity-30 cursor-pointer"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-4 text-center text-xs font-bold tabular-nums">{qty}</span>
                          <button
                            type="button"
                            onClick={() => changeQty(group.id, item.id, 1)}
                            className="w-8 h-8 rounded-full bg-[#F7B518] text-[#2E0A3A] flex items-center justify-center cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div>
            <label className="block text-sm font-bold mb-2">Observações (opcional)</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: sem cebola, ponto da carne, colher descartável..."
              className="w-full rounded-2xl bg-[#4A1259] border border-[#62207A] focus:border-[#F7B518] focus:outline-none px-4 py-3 text-sm text-[#FFF4DC] placeholder:text-[#FFF4DC]/40"
            />
          </div>
        </div>

        {/* Sticky Bottom CTA */}
        <div className="shrink-0 p-4 bg-[#4A1259] border-t border-[#62207A] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 bg-[#2E0A3A] rounded-full px-2 py-1">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-[#4A1259] cursor-pointer"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="w-6 text-center font-display font-bold tabular-nums">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((q) => q + 1)}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-[#4A1259] cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 min-h-[48px] px-5 rounded-full bg-[#F7B518] hover:bg-[#FFD45C] text-[#2E0A3A] font-display font-bold text-base flex items-center justify-center gap-2 shadow-lg shadow-[#F7B518]/25 cursor-pointer"
          >
            <ShoppingBag className="w-4 h-4" />
            Adicionar · R$ {formatBRL(unitPrice * quantity)}
          </button>
        </div>
      </div>
    </div>
  );
};
