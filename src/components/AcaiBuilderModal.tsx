import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  ShoppingBag,
  Sparkles,
  X,
} from 'lucide-react';
import { BuilderConfig, BuilderOptionItem, BuilderSize, CartItem, CartItemSelection } from '../types';
import { formatBRL } from '../utils/format';

interface AcaiBuilderModalProps {
  open: boolean;
  config: BuilderConfig;
  initialSizeId?: string | null;
  onClose: () => void;
  onAddToCart: (item: CartItem) => void;
}

const STEP_LABELS = [
  'Tamanho',
  'Açaí',
  'Creme',
  'Calda',
  'Fruta',
  'Grão',
  'Adicionais',
  'Resumo',
] as const;

function AnimatedPrice({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    const start = display;
    const diff = value - start;
    if (Math.abs(diff) < 0.01) {
      setDisplay(value);
      return;
    }
    let frame = 0;
    const totalFrames = 14;
    const id = requestAnimationFrame(function tick() {
      frame += 1;
      const progress = Math.min(1, frame / totalFrames);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(start + diff * eased);
      if (frame < totalFrames) requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(id);
  }, [value]);

  const formatted = formatBRL(display);
  return (
    <span className="font-display font-bold text-[#F7B518] tabular-nums inline-flex items-start">
      <span className="text-xs mr-0.5 mt-0.5">R$</span>
      <span className="text-2xl leading-none">{formatted}</span>
    </span>
  );
}

export const AcaiBuilderModal: React.FC<AcaiBuilderModalProps> = ({
  open,
  config,
  initialSizeId,
  onClose,
  onAddToCart,
}) => {
  const allSizes = useMemo(
    () => [...config.sizes, ...config.doseDupla].filter((s) => s.available),
    [config]
  );

  const [stepIdx, setStepIdx] = useState(0);
  const [selectedSizeId, setSelectedSizeId] = useState<string>(allSizes[0]?.id || 'tigela-m');
  const [selectedAcai, setSelectedAcai] = useState<string>('acai-puro');
  const [selectedCreme, setSelectedCreme] = useState<string | null>(null);
  const [selectedCaldas, setSelectedCaldas] = useState<string[]>([]);
  const [selectedFrutas, setSelectedFrutas] = useState<string[]>([]);
  const [selectedGrao, setSelectedGrao] = useState<string | null>('grao-granola');
  const [extrasQty, setExtrasQty] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (!open) return;
    const target = initialSizeId
      ? allSizes.find((s) => s.id === initialSizeId) || allSizes[0]
      : allSizes[1] || allSizes[0];
    if (target) setSelectedSizeId(target.id);
    setStepIdx(initialSizeId ? 1 : 0);
    setSelectedAcai(config.steps.find((s) => s.id === 'acai')?.items[0]?.id || 'acai-puro');
    setSelectedCreme(null);
    setSelectedCaldas([]);
    setSelectedFrutas([]);
    setSelectedGrao(config.steps.find((s) => s.id === 'grao')?.items[0]?.id || null);
    setExtrasQty({});
    setNotes('');
    setQuantity(1);
  }, [open, initialSizeId]);

  const currentSize: BuilderSize | undefined = useMemo(
    () => allSizes.find((s) => s.id === selectedSizeId) || allSizes[0],
    [allSizes, selectedSizeId]
  );

  const acaiStep = config.steps.find((s) => s.id === 'acai')!;
  const cremeStep = config.steps.find((s) => s.id === 'creme')!;
  const caldaStep = config.steps.find((s) => s.id === 'calda')!;
  const frutaStep = config.steps.find((s) => s.id === 'fruta')!;
  const graoStep = config.steps.find((s) => s.id === 'grao')!;
  const adicionaisStep = config.steps.find((s) => s.id === 'adicionais')!;

  const availableCaldas = useMemo(() => {
    const base = caldaStep.items.filter((i) => i.available);
    if (currentSize?.allowedCaldaIds && currentSize.allowedCaldaIds.length > 0) {
      return base.filter((i) => currentSize.allowedCaldaIds!.includes(i.id));
    }
    return base;
  }, [caldaStep, currentSize]);

  // Prune caldas if user switched to Dose Dupla
  useEffect(() => {
    const allowedIds = new Set(availableCaldas.map((c) => c.id));
    setSelectedCaldas((prev) => prev.filter((id) => allowedIds.has(id)));
  }, [availableCaldas]);

  const includedCaldas = currentSize?.includedCaldas ?? 1;
  const includedFrutas = currentSize?.includedFrutas ?? 1;
  const includedGraos = currentSize?.includedGraos ?? 1;
  const extraCaldaPrice = currentSize?.extraPrice ?? caldaStep.extraPrice ?? 3;
  const extraFrutaPrice = currentSize?.extraPrice ?? frutaStep.extraPrice ?? 3;

  const extraCaldasCount = Math.max(0, selectedCaldas.length - includedCaldas);
  const extraFrutasCount = Math.max(0, selectedFrutas.length - includedFrutas);

  const adicionaisTotal = useMemo(() => {
    return Object.entries(extrasQty).reduce((sum, [itemId, qty]) => {
      if (qty <= 0) return sum;
      const found = adicionaisStep.items.find((i) => i.id === itemId);
      return sum + (found ? found.price * qty : 0);
    }, 0);
  }, [extrasQty, adicionaisStep]);

  const unitPrice = useMemo(() => {
    const base = currentSize?.price || 0;
    return Number(
      (
        base +
        extraCaldasCount * extraCaldaPrice +
        extraFrutasCount * extraFrutaPrice +
        adicionaisTotal
      ).toFixed(2)
    );
  }, [currentSize, extraCaldasCount, extraCaldaPrice, extraFrutasCount, extraFrutaPrice, adicionaisTotal]);

  if (!open || !currentSize) return null;

  const toggleCalda = (id: string) => {
    setSelectedCaldas((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleFruta = (id: string) => {
    setSelectedFrutas((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const changeExtraQty = (id: string, delta: number) => {
    setExtrasQty((prev) => {
      const next = Math.max(0, (prev[id] || 0) + delta);
      return { ...prev, [id]: next };
    });
  };

  const acaiObj = acaiStep.items.find((i) => i.id === selectedAcai);
  const cremeObj = cremeStep.items.find((i) => i.id === selectedCreme);
  const caldaObjs = selectedCaldas
    .map((id) => availableCaldas.find((c) => c.id === id))
    .filter(Boolean) as BuilderOptionItem[];
  const frutaObjs = selectedFrutas
    .map((id) => frutaStep.items.find((f) => f.id === id))
    .filter(Boolean) as BuilderOptionItem[];
  const graoObj = graoStep.items.find((i) => i.id === selectedGrao);
  const extraObjs = Object.entries(extrasQty)
    .filter(([, q]) => q > 0)
    .map(([id, q]) => {
      const item = adicionaisStep.items.find((i) => i.id === id);
      return item ? { item, qty: q } : null;
    })
    .filter(Boolean) as { item: BuilderOptionItem; qty: number }[];

  const handleFinish = () => {
    const selections: CartItemSelection[] = [
      {
        groupTitle: 'Base',
        items: [
          { name: `${currentSize.name} · Leite em pó incluso`, quantity: 1, extraPrice: 0 },
          ...(acaiObj ? [{ name: acaiObj.name, quantity: 1, extraPrice: 0 }] : []),
        ],
      },
    ];
    if (cremeObj) {
      selections.push({
        groupTitle: 'Creme',
        items: [{ name: cremeObj.name, quantity: 1, extraPrice: 0 }],
      });
    }
    if (caldaObjs.length > 0) {
      selections.push({
        groupTitle: 'Calda',
        items: caldaObjs.map((c, idx) => ({
          name: c.name,
          quantity: 1,
          extraPrice: idx >= includedCaldas ? extraCaldaPrice : 0,
        })),
      });
    }
    if (frutaObjs.length > 0) {
      selections.push({
        groupTitle: 'Fruta',
        items: frutaObjs.map((f, idx) => ({
          name: f.name,
          quantity: 1,
          extraPrice: idx >= includedFrutas ? extraFrutaPrice : 0,
        })),
      });
    }
    if (graoObj) {
      selections.push({
        groupTitle: 'Grão',
        items: [{ name: graoObj.name, quantity: 1, extraPrice: 0 }],
      });
    }
    if (extraObjs.length > 0) {
      selections.push({
        groupTitle: 'Adicionais',
        items: extraObjs.map(({ item, qty }) => ({
          name: item.name,
          quantity: qty,
          extraPrice: item.price * qty,
        })),
      });
    }

    onAddToCart({
      id: `builder-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      productId: currentSize.id,
      name: currentSize.isDoseDupla
        ? `${currentSize.name} (Dose Dupla)`
        : `Açaí Montável · ${currentSize.name}`,
      categoryName: currentSize.isDoseDupla ? 'Dose Dupla' : 'Açaí Montável',
      isBuilder: true,
      unitPrice,
      quantity,
      notes: notes.trim(),
      selections,
    });
    onClose();
  };

  // Live animated bowl/cup preview component
  const LiveBowlPreview = ({ compact = false }: { compact?: boolean }) => (
    <div
      className={`relative flex flex-col items-center justify-center rounded-3xl bg-gradient-to-b from-[#4A1259] to-[#2E0A3A] border border-[#F7B518]/25 overflow-hidden ${
        compact ? 'py-3 px-4' : 'p-6 h-full min-h-[420px]'
      }`}
    >
      <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-[#F7B518]/15 blur-2xl pointer-events-none" />
      <div className="absolute -bottom-10 -left-10 w-36 h-36 rounded-full bg-[#D58BAE]/15 blur-2xl pointer-events-none" />

      <div className={`relative flex items-center justify-center ${compact ? 'w-32 h-24' : 'w-64 h-60'}`}>
        <svg viewBox="0 0 220 200" className="w-full h-full drop-shadow-2xl">
          {/* Vessel */}
          {currentSize.kind === 'copo' ? (
            <>
              <path
                d="M60 56H160L142 180H78L60 56Z"
                fill={acaiObj?.color || '#4A1259'}
                stroke="#F7B518"
                strokeWidth="3.5"
              />
              {/* Leite em po layer */}
              <path d="M64 82H156L153 96H67L64 82Z" fill="#FFF4DC" opacity="0.92" />
              {/* Creme swirl */}
              {cremeObj && (
                <path
                  key={cremeObj.id}
                  d="M68 112H152L149 128H71L68 112Z"
                  fill={cremeObj.color || '#FFF7E4'}
                  className="animate-ingredient-drop"
                />
              )}
              <ellipse cx="110" cy="56" rx="50" ry="13" fill="#62207A" stroke="#F7B518" strokeWidth="3" />
            </>
          ) : (
            <>
              <path d="M36 96C36 146 68 176 110 176C152 176 184 146 184 96H36Z" fill="#C97B2C" />
              <path d="M40 96C40 138 70 166 110 166C150 166 180 138 180 96H40Z" fill="#DF9544" />
              <ellipse cx="110" cy="96" rx="74" ry="20" fill={acaiObj?.color || '#4A1259'} stroke="#F7B518" strokeWidth="3.5" />
              {/* Leite em po dusting */}
              <ellipse cx="110" cy="95" rx="56" ry="13" fill="#FFF4DC" opacity="0.18" />
              {/* Creme */}
              {cremeObj && (
                <path
                  key={cremeObj.id}
                  d="M68 92C84 74 136 74 152 92C136 102 84 102 68 92Z"
                  fill={cremeObj.color || '#FFF7E4'}
                  className="animate-ingredient-drop"
                />
              )}
            </>
          )}

          {/* Dripping Calda */}
          {caldaObjs.map((calda, idx) => (
            <path
              key={calda.id}
              d={
                currentSize.kind === 'copo'
                  ? `M${72 + idx * 14} 58 C${82 + idx * 14} 78, ${96 + idx * 14} 66, ${108 + idx * 14} 88`
                  : `M${66 + idx * 15} 92 C${82 + idx * 15} 78, ${112 + idx * 10} 102, ${138 - idx * 8} 86`
              }
              stroke={calda.color || '#F5B81D'}
              strokeWidth="7"
              strokeLinecap="round"
              fill="none"
              className="animate-ingredient-drop"
            />
          ))}

          {/* Grao sprinkles */}
          {graoObj && (
            <g key={graoObj.id} className="animate-ingredient-drop">
              <circle cx="84" cy={currentSize.kind === 'copo' ? 53 : 88} r="4" fill={graoObj.color || '#C68C48'} />
              <circle cx="98" cy={currentSize.kind === 'copo' ? 50 : 85} r="3.5" fill={graoObj.color || '#C68C48'} />
              <circle cx="115" cy={currentSize.kind === 'copo' ? 52 : 89} r="4" fill={graoObj.color || '#C68C48'} />
              <circle cx="132" cy={currentSize.kind === 'copo' ? 54 : 87} r="3.5" fill={graoObj.color || '#C68C48'} />
            </g>
          )}

          {/* Frutas dropping */}
          {frutaObjs.map((f, idx) => {
            const cx = 76 + ((idx * 22) % 72);
            const cy = (currentSize.kind === 'copo' ? 46 : 78) - (idx % 2) * 8;
            return (
              <g key={f.id} className="animate-ingredient-drop">
                <circle cx={cx} cy={cy} r="10" fill={f.color || '#E83B4F'} stroke="#FFF4DC" strokeWidth="1.5" />
              </g>
            );
          })}

          {/* Extras dots */}
          {extraObjs.slice(0, 6).map(({ item }, idx) => (
            <circle
              key={item.id}
              cx={72 + idx * 15}
              cy={currentSize.kind === 'copo' ? 41 : 73}
              r="5"
              fill="#F7B518"
              stroke="#2E0A3A"
              strokeWidth="1.5"
              className="animate-ingredient-drop"
            />
          ))}
        </svg>
      </div>

      {!compact && (
        <div className="mt-4 w-full space-y-2 text-center">
          <div className="text-sm font-bold text-[#F7B518]">{currentSize.name}</div>
          <p className="text-xs text-[#FFF4DC]/75 leading-relaxed">
            Já acompanha leite em pó · {includedCaldas} calda · {includedFrutas} fruta(s) · {includedGraos} grão · creme opcional
          </p>
          <div className="pt-2 flex flex-wrap justify-center gap-1.5 text-[11px] text-[#FFF4DC]/85">
            {acaiObj && <span>{acaiObj.name}</span>}
            {cremeObj && <span>· {cremeObj.name}</span>}
            {caldaObjs.map((c) => (
              <span key={c.id}>· {c.name}</span>
            ))}
            {frutaObjs.map((f) => (
              <span key={f.id}>· {f.name}</span>
            ))}
            {graoObj && <span>· {graoObj.name}</span>}
            {extraObjs.map(({ item, qty }) => (
              <span key={item.id}>
                · {qty}x {item.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderStepCounter = (current: number, included: number, optional = false) => {
    const done = optional ? current >= 0 && current <= included : current >= included;
    return (
      <div className="flex items-center gap-2 text-xs font-semibold">
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full tabular-nums transition-colors ${
            current >= included && included > 0
              ? 'bg-[#3DDC84]/20 text-[#3DDC84]'
              : 'bg-[#62207A] text-[#FFF4DC]'
          }`}
        >
          {current >= included && included > 0 && <Check className="w-3.5 h-3.5" />}
          {included > 0
            ? `Escolha ${Math.min(current, included)} de ${included} incluso(s)`
            : `${current} selecionado(s)`}
        </span>
        {done && current > included && included > 0 && (
          <span className="text-[#F7B518]">
            +{current - included} adicional (+ R$ {formatBRL((current - included) * extraCaldaPrice)})
          </span>
        )}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/75 backdrop-blur-sm p-0 lg:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Montador de Açaí Tropicália"
    >
      <div className="relative w-full h-[96dvh] lg:h-[88vh] lg:max-w-5xl bg-[#2E0A3A] text-[#FFF4DC] rounded-t-[28px] lg:rounded-[28px] shadow-2xl border border-[#62207A] flex flex-col overflow-hidden">
        {/* Header + Step Progress */}
        <div className="shrink-0 px-4 sm:px-6 pt-4 pb-3 border-b border-[#62207A]/70 bg-[#4A1259]/70">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-[#F7B518] tracking-wide">
                Monte do seu jeito · Etapa {stepIdx + 1} de {STEP_LABELS.length}
              </p>
              <h2 className="font-display text-xl sm:text-2xl font-extrabold text-[#FFF4DC]">
                {STEP_LABELS[stepIdx]}
              </h2>
            </div>
            <button
              onClick={onClose}
              aria-label="Fechar montador"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-[#62207A] hover:bg-[#772A93] text-[#FFF4DC] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Step pills / bar */}
          <div className="mt-3 flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
            {STEP_LABELS.map((label, idx) => {
              const active = idx === stepIdx;
              const passed = idx < stepIdx;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setStepIdx(idx)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-[#F7B518] text-[#2E0A3A]'
                      : passed
                      ? 'bg-[#3DDC84]/20 text-[#3DDC84]'
                      : 'bg-[#2E0A3A]/70 text-[#FFF4DC]/70 hover:text-[#FFF4DC]'
                  }`}
                >
                  {passed ? '✓ ' : `${idx + 1}. `}
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Main 2-Column Body */}
        <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-12 overflow-hidden">
          {/* Mobile Compact Bowl */}
          <div className="lg:hidden shrink-0 px-4 pt-3">
            <LiveBowlPreview compact />
          </div>

          {/* Desktop Left Column */}
          <div className="hidden lg:block lg:col-span-5 p-6 border-r border-[#62207A]/60">
            <LiveBowlPreview />
          </div>

          {/* Step Content Scrollable */}
          <div className="flex-1 lg:col-span-7 overflow-y-auto p-4 sm:p-6 space-y-5">
            {stepIdx === 0 && (
              <div className="space-y-6">
                <div>
                  <h3 className="font-display text-lg font-bold text-[#FFF4DC] mb-1">
                    Tigelas e Copos Tradicionais
                  </h3>
                  <p className="text-sm text-[#FFF4DC]/70 mb-3">
                    Já acompanha leite em pó, 1 calda, 1 grão, 1 fruta e 1 creme (opcional).
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {config.sizes
                      .filter((s) => s.available)
                      .map((sz) => {
                        const selected = selectedSizeId === sz.id;
                        return (
                          <button
                            key={sz.id}
                            type="button"
                            onClick={() => setSelectedSizeId(sz.id)}
                            className={`text-left p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between ${
                              selected
                                ? 'bg-[#62207A] border-[#F7B518] shadow-lg shadow-[#F7B518]/15'
                                : 'bg-[#4A1259]/80 border-transparent hover:border-[#D58BAE]/40'
                            }`}
                          >
                            <div>
                              <div className="font-display text-base font-bold text-[#FFF4DC]">
                                {sz.name}
                              </div>
                              <div className="text-xs text-[#FFF4DC]/70">{sz.volume}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-display font-bold text-[#F7B518] tabular-nums">
                                <span className="text-[10px] mr-0.5">R$</span>
                                {formatBRL(sz.price)}
                              </span>
                              {selected && (
                                <span className="w-6 h-6 rounded-full bg-[#F7B518] text-[#2E0A3A] flex items-center justify-center">
                                  <Check className="w-4 h-4 stroke-[3]" />
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                  </div>
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="px-2.5 py-0.5 rounded-md bg-[#FF6B5E] text-white text-xs font-extrabold tracking-wide">
                      OFERTA ESPECIAL
                    </span>
                    <span className="font-script text-base text-[#F7B518]">
                      Uma delícia da casa, agora em dose dupla!
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {config.doseDupla
                      .filter((s) => s.available)
                      .map((sz) => {
                        const selected = selectedSizeId === sz.id;
                        return (
                          <button
                            key={sz.id}
                            type="button"
                            onClick={() => setSelectedSizeId(sz.id)}
                            className={`text-left p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                              selected
                                ? 'bg-[#62207A] border-[#F7B518] shadow-lg shadow-[#F7B518]/20'
                                : 'bg-[#4A1259] border-[#F7B518]/30 hover:border-[#F7B518]'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="font-display text-base font-extrabold text-[#FFF4DC]">
                                  {sz.name}
                                </div>
                                <p className="text-xs text-[#FFF4DC]/75 mt-1">{sz.description}</p>
                              </div>
                              <span className="font-display font-bold text-[#F7B518] tabular-nums shrink-0">
                                <span className="text-[10px] mr-0.5">R$</span>
                                {formatBRL(sz.price)}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                  </div>
                </div>
              </div>
            )}

            {stepIdx === 1 && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-[#FFF4DC]/80">{acaiStep.subtitle}</p>
                  {renderStepCounter(selectedAcai ? 1 : 0, 1)}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {acaiStep.items
                    .filter((i) => i.available)
                    .map((item) => {
                      const active = selectedAcai === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedAcai(item.id)}
                          className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer flex items-center justify-between gap-3 ${
                            active
                              ? 'bg-[#62207A] border-[#F7B518] shadow-md'
                              : 'bg-[#4A1259]/80 border-transparent hover:border-[#D58BAE]/40'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className="w-8 h-8 rounded-full border-2 border-[#FFF4DC]/40 shrink-0"
                              style={{ backgroundColor: item.color || '#4A1259' }}
                            />
                            <span className="font-bold text-sm text-[#FFF4DC]">{item.name}</span>
                          </div>
                          {active && <Check className="w-5 h-5 text-[#F7B518] shrink-0" />}
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

            {stepIdx === 2 && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-[#FFF4DC]/80">{cremeStep.subtitle}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCreme(null);
                      setStepIdx(3);
                    }}
                    className="text-xs font-bold text-[#F7B518] hover:underline cursor-pointer"
                  >
                    Pular creme →
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {cremeStep.items
                    .filter((i) => i.available)
                    .map((item) => {
                      const active = selectedCreme === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedCreme(active ? null : item.id)}
                          className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer flex items-center justify-between gap-3 ${
                            active
                              ? 'bg-[#62207A] border-[#F7B518] shadow-md'
                              : 'bg-[#4A1259]/80 border-transparent hover:border-[#D58BAE]/40'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className="w-8 h-8 rounded-full border border-[#2E0A3A]/30 shrink-0"
                              style={{ backgroundColor: item.color || '#FFF7E4' }}
                            />
                            <div>
                              <div className="font-bold text-sm text-[#FFF4DC]">{item.name}</div>
                              <div className="text-[11px] text-[#3DDC84]">Incluso</div>
                            </div>
                          </div>
                          {active && <Check className="w-5 h-5 text-[#F7B518] shrink-0" />}
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

            {stepIdx === 3 && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm text-[#FFF4DC]/80">
                      {includedCaldas} calda inclusa ·{' '}
                      <span className="text-[#F7B518] font-bold">
                        + R$ {formatBRL(extraCaldaPrice)} por calda adicional
                      </span>
                    </p>
                  </div>
                  {renderStepCounter(selectedCaldas.length, includedCaldas, true)}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {availableCaldas.map((item) => {
                    const active = selectedCaldas.includes(item.id);
                    const willCostExtra = !active && selectedCaldas.length >= includedCaldas;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => toggleCalda(item.id)}
                        className={`p-3 rounded-2xl border-2 text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                          active
                            ? 'bg-[#62207A] border-[#F7B518]'
                            : 'bg-[#4A1259]/80 border-transparent hover:border-[#D58BAE]/40'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="w-5 h-5 rounded-full shrink-0 border border-white/30"
                            style={{ backgroundColor: item.color || '#F7B518' }}
                          />
                          <div className="min-w-0">
                            <div className="font-semibold text-xs sm:text-sm text-[#FFF4DC] truncate">
                              {item.name}
                            </div>
                            {willCostExtra && (
                              <div className="text-[11px] text-[#F7B518] font-bold">
                                + R$ {formatBRL(extraCaldaPrice)}
                              </div>
                            )}
                          </div>
                        </div>
                        {active && <Check className="w-4 h-4 text-[#F7B518] shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {stepIdx === 4 && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-[#FFF4DC]/80">
                    {includedFrutas} fruta(s) inclusa(s) ·{' '}
                    <span className="text-[#F7B518] font-bold">
                      + R$ {formatBRL(extraFrutaPrice)} por fruta adicional
                    </span>
                  </p>
                  {renderStepCounter(selectedFrutas.length, includedFrutas, true)}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {frutaStep.items
                    .filter((i) => i.available)
                    .map((item) => {
                      const active = selectedFrutas.includes(item.id);
                      const willCostExtra = !active && selectedFrutas.length >= includedFrutas;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => toggleFruta(item.id)}
                          className={`p-3.5 rounded-2xl border-2 text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                            active
                              ? 'bg-[#62207A] border-[#F7B518]'
                              : 'bg-[#4A1259]/80 border-transparent hover:border-[#D58BAE]/40'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span
                              className="w-6 h-6 rounded-full shrink-0 border border-white/30"
                              style={{ backgroundColor: item.color || '#E83B4F' }}
                            />
                            <div>
                              <div className="font-bold text-sm text-[#FFF4DC]">{item.name}</div>
                              {willCostExtra ? (
                                <div className="text-[11px] text-[#F7B518] font-bold">
                                  + R$ {formatBRL(extraFrutaPrice)}
                                </div>
                              ) : (
                                <div className="text-[11px] text-[#3DDC84]">Inclusa</div>
                              )}
                            </div>
                          </div>
                          {active && <Check className="w-4 h-4 text-[#F7B518] shrink-0" />}
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

            {stepIdx === 5 && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-[#FFF4DC]/80">{graoStep.subtitle}</p>
                  {renderStepCounter(selectedGrao ? 1 : 0, 1, true)}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {graoStep.items
                    .filter((i) => i.available)
                    .map((item) => {
                      const active = selectedGrao === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedGrao(active ? null : item.id)}
                          className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                            active
                              ? 'bg-[#62207A] border-[#F7B518]'
                              : 'bg-[#4A1259]/80 border-transparent hover:border-[#D58BAE]/40'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span
                              className="w-6 h-6 rounded-full shrink-0"
                              style={{ backgroundColor: item.color || '#C68C48' }}
                            />
                            <span className="font-bold text-sm text-[#FFF4DC]">{item.name}</span>
                          </div>
                          {active && <Check className="w-4 h-4 text-[#F7B518] shrink-0" />}
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

            {stepIdx === 6 && (
              <div className="space-y-4">
                <p className="text-sm text-[#FFF4DC]/80">{adicionaisStep.subtitle}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {adicionaisStep.items
                    .filter((i) => i.available)
                    .map((item) => {
                      const qty = extrasQty[item.id] || 0;
                      return (
                        <div
                          key={item.id}
                          className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-2 ${
                            qty > 0
                              ? 'bg-[#62207A] border-[#F7B518]'
                              : 'bg-[#4A1259]/75 border-transparent'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="font-semibold text-sm text-[#FFF4DC] truncate">
                              {item.name}
                            </div>
                            <div className="text-xs font-bold text-[#F7B518] tabular-nums">
                              + R$ {formatBRL(item.price)}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => changeExtraQty(item.id, -1)}
                              disabled={qty === 0}
                              aria-label={`Remover ${item.name}`}
                              className="w-9 h-9 rounded-full bg-[#2E0A3A] text-[#FFF4DC] disabled:opacity-30 flex items-center justify-center cursor-pointer"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <span className="w-5 text-center font-bold text-sm tabular-nums">
                              {qty}
                            </span>
                            <button
                              type="button"
                              onClick={() => changeExtraQty(item.id, 1)}
                              aria-label={`Adicionar ${item.name}`}
                              className="w-9 h-9 rounded-full bg-[#F7B518] text-[#2E0A3A] flex items-center justify-center font-bold cursor-pointer hover:bg-[#FFD45C]"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {stepIdx === 7 && (
              <div className="space-y-5">
                <div className="p-4 sm:p-5 rounded-3xl bg-[#4A1259] border border-[#62207A] space-y-3">
                  <div className="flex items-center gap-2 text-[#F7B518] font-display font-bold text-lg">
                    <Sparkles className="w-5 h-5" />
                    Resumo da sua montagem
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-[#FFF4DC]/75">Tamanho</span>
                      <span className="font-bold">
                        {currentSize.name} (R$ {formatBRL(currentSize.price)})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#FFF4DC]/75">Acompanha</span>
                      <span className="font-semibold">Leite em pó</span>
                    </div>
                    {acaiObj && (
                      <div className="flex justify-between">
                        <span className="text-[#FFF4DC]/75">Açaí</span>
                        <span className="font-semibold">{acaiObj.name}</span>
                      </div>
                    )}
                    {cremeObj && (
                      <div className="flex justify-between">
                        <span className="text-[#FFF4DC]/75">Creme</span>
                        <span className="font-semibold">{cremeObj.name}</span>
                      </div>
                    )}
                    {caldaObjs.length > 0 && (
                      <div className="flex justify-between gap-4">
                        <span className="text-[#FFF4DC]/75">Calda(s)</span>
                        <span className="font-semibold text-right">
                          {caldaObjs.map((c) => c.name).join(', ')}
                          {extraCaldasCount > 0 &&
                            ` (+ R$ ${formatBRL(extraCaldasCount * extraCaldaPrice)})`}
                        </span>
                      </div>
                    )}
                    {frutaObjs.length > 0 && (
                      <div className="flex justify-between gap-4">
                        <span className="text-[#FFF4DC]/75">Fruta(s)</span>
                        <span className="font-semibold text-right">
                          {frutaObjs.map((f) => f.name).join(', ')}
                          {extraFrutasCount > 0 &&
                            ` (+ R$ ${formatBRL(extraFrutasCount * extraFrutaPrice)})`}
                        </span>
                      </div>
                    )}
                    {graoObj && (
                      <div className="flex justify-between">
                        <span className="text-[#FFF4DC]/75">Grão</span>
                        <span className="font-semibold">{graoObj.name}</span>
                      </div>
                    )}
                    {extraObjs.length > 0 && (
                      <div className="pt-2 border-t border-[#62207A]">
                        <span className="text-[#FFF4DC]/75 block mb-1">Adicionais:</span>
                        <div className="space-y-1">
                          {extraObjs.map(({ item, qty }) => (
                            <div key={item.id} className="flex justify-between text-xs">
                              <span>
                                {qty}x {item.name}
                              </span>
                              <span className="text-[#F7B518] font-bold tabular-nums">
                                + R$ {formatBRL(item.price * qty)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-[#FFF4DC] mb-2">
                    Observações do item (opcional)
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ex: mandar colher, caprichar no leite em pó, calda separada..."
                    className="w-full rounded-2xl bg-[#4A1259] border border-[#62207A] focus:border-[#F7B518] focus:outline-none px-4 py-3 text-sm text-[#FFF4DC] placeholder:text-[#FFF4DC]/40"
                  />
                </div>

                <div className="flex items-center justify-between p-4 rounded-2xl bg-[#4A1259]">
                  <span className="font-bold text-sm">Quantidade</span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      className="w-10 h-10 rounded-full bg-[#2E0A3A] text-[#FFF4DC] flex items-center justify-center cursor-pointer"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="font-display text-lg font-bold w-6 text-center tabular-nums">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => q + 1)}
                      className="w-10 h-10 rounded-full bg-[#F7B518] text-[#2E0A3A] flex items-center justify-center cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Thumb-Zone Bar */}
        <div className="shrink-0 px-4 sm:px-6 py-3.5 border-t border-[#62207A] bg-[#4A1259] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {stepIdx > 0 && (
              <button
                type="button"
                onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
                className="min-h-[48px] px-4 rounded-full bg-[#2E0A3A] hover:bg-[#3B104B] text-[#FFF4DC] font-bold text-sm flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                Voltar
              </button>
            )}
            <div>
              <div className="text-[11px] text-[#FFF4DC]/70">Total do item</div>
              <AnimatedPrice value={unitPrice * quantity} />
            </div>
          </div>

          {stepIdx < STEP_LABELS.length - 1 ? (
            <button
              type="button"
              onClick={() => setStepIdx((i) => Math.min(STEP_LABELS.length - 1, i + 1))}
              className="min-h-[48px] px-6 rounded-full bg-[#F7B518] hover:bg-[#FFD45C] text-[#2E0A3A] font-display font-bold text-base flex items-center gap-2 shadow-lg shadow-[#F7B518]/25 transition-transform active:scale-95 cursor-pointer"
            >
              Próximo
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinish}
              className="min-h-[48px] px-6 rounded-full bg-[#F7B518] hover:bg-[#FFD45C] text-[#2E0A3A] font-display font-bold text-base flex items-center gap-2 shadow-lg shadow-[#F7B518]/30 transition-transform active:scale-95 cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4" />
              Adicionar ao carrinho
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
