import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight,
  Instagram,
  MapPin,
  MessageCircle,
  Plus,
  ReceiptText,
  ShoppingBag,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import {
  BuilderConfig,
  CartItem,
  MenuCategory,
  Product,
  StoreSettings,
} from '../types';
import { formatBRL } from '../utils/format';
import { HeroScrollSequence } from './HeroScrollSequence';
import {
  ProductBrandArtwork,
  SectionWaveDivider,
} from './TropicalArtwork';

interface StorefrontProps {
  settings: StoreSettings;
  categories: MenuCategory[];
  products: Product[];
  builderConfig: BuilderConfig;
  isOpenNow: boolean;
  cart: CartItem[];
  cartBounceKey: number;
  activeOrdersCount: number;
  onOpenBuilder: (sizeId?: string) => void;
  onSelectProduct: (product: Product, categoryName: string) => void;
  onQuickAddProduct: (product: Product, categoryName: string) => void;
  onOpenCart: () => void;
  onOpenTracking: () => void;
}

const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export const Storefront: React.FC<StorefrontProps> = ({
  settings,
  categories,
  products,
  builderConfig,
  isOpenNow,
  cart,
  cartBounceKey,
  activeOrdersCount,
  onOpenBuilder,
  onSelectProduct,
  onQuickAddProduct,
  onOpenCart,
  onOpenTracking,
}) => {
  const [scrollProgress, setScrollProgress] = useState(0);
  const [activeSlug, setActiveSlug] = useState<string>(categories[0]?.slug || 'acai-montavel');
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const totalCartItems = useMemo(() => cart.reduce((s, i) => s + i.quantity, 0), [cart]);
  const totalCartPrice = useMemo(
    () => cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0),
    [cart]
  );

  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      const maxScroll = doc.scrollHeight - window.innerHeight;
      setScrollProgress(maxScroll > 0 ? Math.min(100, (window.scrollY / maxScroll) * 100) : 0);

      const offset = 150;
      for (const cat of categories) {
        const el = sectionRefs.current[cat.slug];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top <= offset && rect.bottom > offset) {
          setActiveSlug(cat.slug);
          break;
        }
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [categories]);

  const scrollToCategory = (slug: string) => {
    setActiveSlug(slug);
    const el = sectionRefs.current[slug];
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 124;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  const handleProductClick = (product: Product, categoryName: string) => {
    if (!product.available) return;
    if (product.optionGroups && product.optionGroups.length > 0) {
      onSelectProduct(product, categoryName);
    } else {
      onQuickAddProduct(product, categoryName);
    }
  };

  const renderBadge = (badge: string) => {
    if (!badge) return null;
    const isPromo = badge === 'OFERTA ESPECIAL' || badge === 'PROMO';
    return (
      <span
        className={`inline-block px-2.5 py-0.5 rounded-r-full text-[10px] font-extrabold tracking-wider uppercase shadow-sm ${
          isPromo
            ? 'bg-[#FF6B5E] text-white'
            : badge === 'NOVO'
            ? 'bg-[#3DDC84] text-[#2E0A3A]'
            : 'bg-[#F7B518] text-[#2E0A3A]'
        }`}
      >
        {badge}
      </span>
    );
  };

  const PriceTag = ({ value, lightBg = false }: { value: number; lightBg?: boolean }) => (
    <span
      className={`font-display font-bold tabular-nums inline-flex items-start ${
        lightBg ? 'text-[#4A1259]' : 'text-[#F7B518]'
      }`}
    >
      <span className="text-[11px] mr-0.5 mt-0.5">R$</span>
      <span className="text-lg sm:text-xl leading-none">{formatBRL(value)}</span>
    </span>
  );

  return (
    <div className="min-h-screen bg-[#2E0A3A] text-[#FFF4DC] pb-24 md:pb-0">
      {/* Scroll Progress Thin Yellow Bar */}
      <div className="fixed top-0 left-0 right-0 h-1 z-50 bg-transparent pointer-events-none">
        <div
          className="h-full bg-[#F7B518] transition-[width] duration-75"
          style={{ width: `${scrollProgress}%` }}
        />
      </div>

      {/* Sticky Top Header */}
      <header className="sticky top-0 z-40 bg-[#2E0A3A]/95 backdrop-blur-md border-b border-[#62207A]/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 sm:h-[72px] flex items-center justify-between gap-3">
          {/* Brand + Live Status */}
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={settings.logoUrl || '/assets/aistudio/image_82f9cbd7.png'}
              alt={settings.storeName}
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover border-2 border-[#F7B518] shrink-0"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-display text-lg sm:text-xl font-extrabold truncate">
                  {settings.storeName}
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 text-[11px] font-extrabold px-2 py-0.5 rounded-full whitespace-nowrap ${
                    isOpenNow
                      ? 'bg-[#2F6B3D]/40 text-[#3DDC84]'
                      : 'bg-[#FF6B5E]/20 text-[#FF6B5E]'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isOpenNow ? 'bg-[#3DDC84] animate-pulse' : 'bg-[#FF6B5E]'
                    }`}
                  />
                  {isOpenNow ? 'ABERTO AGORA' : 'FECHADO'}
                </span>
              </div>
              <div className="hidden sm:flex items-center gap-2 text-xs text-[#FFF4DC]/70">
                <span>{settings.estimatedTime}</span>
                <span>·</span>
                <span>Entrega R$ {formatBRL(settings.deliveryFee)}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenTracking}
              className="min-h-[42px] px-3 sm:px-4 rounded-full bg-[#4A1259] hover:bg-[#62207A] text-xs sm:text-sm font-bold text-[#FFF4DC] flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <ReceiptText className="w-4 h-4 text-[#F7B518]" />
              <span className="hidden sm:inline">Meus pedidos</span>
              {activeOrdersCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-[#F7B518] text-[#2E0A3A] text-[10px] font-extrabold tabular-nums">
                  {activeOrdersCount}
                </span>
              )}
            </button>

            <button
              key={cartBounceKey}
              type="button"
              onClick={onOpenCart}
              className="hidden md:flex min-h-[44px] px-5 rounded-full bg-[#F7B518] hover:bg-[#FFD45C] text-[#2E0A3A] font-display font-bold text-sm items-center gap-2 shadow-lg shadow-[#F7B518]/25 cursor-pointer animate-cart-bounce whitespace-nowrap"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Carrinho</span>
              <span className="px-2 py-0.5 rounded-full bg-[#2E0A3A] text-[#F7B518] text-xs font-extrabold tabular-nums">
                {totalCartItems}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Closed Store Banner */}
      {!isOpenNow && (
        <div className="bg-[#4A1259] border-b border-[#FF6B5E]/40 px-4 py-2.5 text-center text-xs sm:text-sm font-semibold text-[#FFF4DC]">
          Estamos fechados no momento. Você pode explorar o cardápio à vontade, e os pedidos reabrem no próximo horário.
        </div>
      )}

      {/* HERO SCROLL ANIMATION SECTION */}
      <HeroScrollSequence
        estimatedTime={settings.estimatedTime}
        onOpenBuilder={() => onOpenBuilder()}
        onViewMenu={() => scrollToCategory(categories[0]?.slug || 'acai-montavel')}
      />

      {/* Marquee Strip */}
      <div className="bg-[#F7B518] text-[#2E0A3A] py-2.5 overflow-hidden border-y border-[#FFD45C]">
        <div className="flex whitespace-nowrap animate-marquee font-display font-extrabold text-sm sm:text-base tracking-wide">
          {[1, 2, 3, 4].map((k) => (
            <span key={k} className="mx-6">
              Monte do seu jeito • Cremoso • Feito com carinho • Delivery rápido • Tropicália Açaí •
            </span>
          ))}
        </div>
      </div>

      {/* STICKY CATEGORY CHIPS NAVIGATION */}
      <nav
        aria-label="Categorias do cardápio"
        className="sticky top-16 sm:top-[72px] z-30 bg-[#2E0A3A]/95 backdrop-blur-md border-b border-[#62207A]/60"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center gap-2 overflow-x-auto no-scrollbar">
          {categories.map((cat) => {
            const active = activeSlug === cat.slug;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => scrollToCategory(cat.slug)}
                className={`shrink-0 px-4 py-2 rounded-full text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-[#F7B518] text-[#2E0A3A] shadow-md shadow-[#F7B518]/25'
                    : 'bg-[#4A1259] text-[#FFF4DC]/80 hover:text-[#FFF4DC] hover:bg-[#62207A]'
                }`}
              >
                {cat.name}
              </button>
            );
          })}
        </div>
      </nav>

      {/* MENU CATEGORIES */}
      <main>
        {categories.map((cat, idx) => {
          const catProducts = products.filter((p) => p.categoryId === cat.id);
          const isCreamSection = cat.slug === 'sorvete-de-creme' || cat.slug === 'paletas';

          // 1. STAR SECTION: AÇAÍ MONTÁVEL
          if (cat.layoutType === 'builder') {
            return (
              <section
                key={cat.id}
                ref={(el) => {
                  sectionRefs.current[cat.slug] = el;
                }}
                className="py-12 sm:py-16 px-4 sm:px-6 max-w-7xl mx-auto"
              >
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
                  <div>
                    <span className="font-script text-xl text-[#F7B518]">A estrela da casa</span>
                    <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-[#FFF4DC] mt-1">
                      {cat.name}
                    </h2>
                    <p className="text-sm sm:text-base text-[#FFF4DC]/75 mt-1">
                      Já acompanha leite em pó, 1 calda, 1 grão, 1 fruta e 1 creme (opcional).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenBuilder()}
                    className="self-start md:self-auto min-h-[46px] px-6 rounded-full bg-[#F7B518] hover:bg-[#FFD45C] text-[#2E0A3A] font-display font-bold text-sm flex items-center gap-2 cursor-pointer"
                  >
                    Abrir montador completo
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {builderConfig.sizes
                    .filter((s) => s.available)
                    .map((sz) => (
                      <button
                        key={sz.id}
                        type="button"
                        onClick={() => onOpenBuilder(sz.id)}
                        className="group text-left rounded-[26px] overflow-hidden bg-gradient-to-br from-[#4A1259] to-[#62207A]/90 border border-[#F7B518]/25 hover:border-[#F7B518] shadow-xl hover:-translate-y-1 transition-all cursor-pointer flex flex-col justify-between"
                      >
                        <div className="h-32 w-full relative overflow-hidden">
                          <img
                            src={
                              sz.kind === 'tigela'
                                ? '/images/products/tigelinha.jpg'
                                : '/images/products/copinho.jpg'
                            }
                            alt={sz.name}
                            loading="lazy"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-[#4A1259] via-transparent to-transparent" />
                          <span className="absolute top-3 left-3 px-2.5 py-0.5 rounded-full bg-[#2E0A3A]/85 text-[10px] font-extrabold text-[#F7B518] uppercase tracking-wider">
                            {sz.kind === 'tigela' ? 'Tigela artesanal' : 'Copo caprichado'}
                          </span>
                        </div>
                        <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                          <div className="flex items-start justify-between gap-3">
                            <h3 className="font-display text-2xl font-extrabold text-[#FFF4DC]">
                              {sz.name}
                            </h3>
                            <span className="w-9 h-9 rounded-full bg-[#F7B518] text-[#2E0A3A] flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                              <Plus className="w-5 h-5 stroke-[2.5]" />
                            </span>
                          </div>
                          <div className="flex items-end justify-between pt-2 border-t border-[#FFF4DC]/10">
                            <span className="text-xs text-[#FFF4DC]/70">Toque para montar</span>
                            <PriceTag value={sz.price} />
                          </div>
                        </div>
                      </button>
                    ))}
                </div>
              </section>
            );
          }

          // 2. DOSE DUPLA HIGHLIGHT
          if (cat.slug === 'dose-dupla') {
            return (
              <section
                key={cat.id}
                ref={(el) => {
                  sectionRefs.current[cat.slug] = el;
                }}
                className="py-8 sm:py-12 px-4 sm:px-6 max-w-7xl mx-auto"
              >
                <div className="rounded-[32px] bg-gradient-to-r from-[#4A1259] via-[#62207A] to-[#4A1259] border border-[#F7B518]/35 p-6 sm:p-8 shadow-2xl">
                  <div className="flex flex-wrap items-center gap-3 mb-2">
                    <span className="px-3 py-1 rounded-full bg-[#FF6B5E] text-white text-xs font-extrabold tracking-wider">
                      OFERTA ESPECIAL
                    </span>
                    <span className="font-script text-xl text-[#F7B518]">
                      Uma delícia da casa, agora em dose dupla!
                    </span>
                  </div>
                  <h2 className="font-display text-2xl sm:text-3xl font-extrabold mb-6">
                    {cat.name}
                  </h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {builderConfig.doseDupla
                      .filter((d) => d.available)
                      .map((dd) => (
                        <button
                          key={dd.id}
                          type="button"
                          onClick={() => onOpenBuilder(dd.id)}
                          className="text-left p-4 rounded-[24px] bg-[#2E0A3A]/75 hover:bg-[#2E0A3A] border border-[#F7B518]/35 hover:border-[#F7B518] transition-all flex items-center justify-between gap-4 cursor-pointer"
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            <img
                              src={
                                dd.kind === 'tigela'
                                  ? '/images/products/tigelinha.jpg'
                                  : '/images/products/copinho.jpg'
                              }
                              alt={dd.name}
                              loading="lazy"
                              className="w-20 h-20 rounded-2xl object-cover shrink-0 border border-[#F7B518]/30"
                            />
                            <div className="space-y-1 min-w-0">
                              <h3 className="font-display text-xl font-extrabold text-[#FFF4DC]">
                                {dd.name}
                              </h3>
                              <p className="text-xs sm:text-sm text-[#FFF4DC]/75">{dd.description}</p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <PriceTag value={dd.price} />
                            <span className="px-3 py-1 rounded-full bg-[#F7B518] text-[#2E0A3A] text-xs font-bold">
                              Montar agora
                            </span>
                          </div>
                        </button>
                      ))}
                  </div>
                </div>
              </section>
            );
          }

          // OTHER CATEGORIES (with alternating cream breathing sections)
          if (catProducts.length === 0) return null;

          const containerClasses = isCreamSection
            ? 'bg-[#FFF4DC] text-[#2E0A3A] py-12 sm:py-16'
            : 'bg-[#2E0A3A] text-[#FFF4DC] py-10 sm:py-14';

          return (
            <React.Fragment key={cat.id}>
              {idx > 0 && categories[idx - 1]?.slug !== 'sorvete-de-creme' && isCreamSection && (
                <SectionWaveDivider topColor="#2E0A3A" bottomColor="#FFF4DC" />
              )}
              {!isCreamSection &&
                (categories[idx - 1]?.slug === 'sorvete-de-creme' ||
                  categories[idx - 1]?.slug === 'paletas') && (
                  <SectionWaveDivider topColor="#FFF4DC" bottomColor="#2E0A3A" flip />
                )}

              <section
                ref={(el) => {
                  sectionRefs.current[cat.slug] = el;
                }}
                className={containerClasses}
              >
                <div className="max-w-7xl mx-auto px-4 sm:px-6">
                  <div className="mb-6">
                    <h2 className="font-display text-2xl sm:text-3xl font-extrabold">{cat.name}</h2>
                    {cat.subtitle && (
                      <p
                        className={`text-sm mt-1 ${
                          isCreamSection ? 'text-[#4A1259]/80' : 'text-[#FFF4DC]/70'
                        }`}
                      >
                        {cat.subtitle}
                      </p>
                    )}
                  </div>

                  {/* CAROUSEL LAYOUT */}
                  {cat.layoutType === 'carousel' && (
                    <div className="flex gap-4 overflow-x-auto pb-4 snap-x no-scrollbar">
                      {catProducts.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => handleProductClick(p, cat.name)}
                          className={`snap-start shrink-0 w-64 sm:w-72 rounded-[24px] overflow-hidden border transition-all flex flex-col justify-between ${
                            p.available
                              ? 'cursor-pointer hover:-translate-y-1'
                              : 'opacity-45 grayscale cursor-not-allowed'
                          } ${
                            isCreamSection
                              ? 'bg-white border-[#4A1259]/15 shadow-lg'
                              : 'bg-[#4A1259] border-[#62207A] shadow-xl'
                          }`}
                        >
                          <div>
                            <div className="h-40 relative overflow-hidden">
                              <ProductBrandArtwork
                                categoryId={p.categoryId}
                                name={p.name}
                                imageUrl={p.imageUrl}
                                className="w-full h-full"
                              />
                              {p.badge && (
                                <div className="absolute top-3 left-0">{renderBadge(p.badge)}</div>
                              )}
                              {!p.available && (
                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center font-display font-bold text-sm text-white">
                                  ESGOTADO
                                </div>
                              )}
                            </div>
                            <div className="p-4 space-y-1.5">
                              <h3 className="font-display text-lg font-bold leading-tight">
                                {p.name}
                              </h3>
                              <p
                                className={`text-xs line-clamp-2 ${
                                  isCreamSection ? 'text-[#4A1259]/75' : 'text-[#FFF4DC]/75'
                                }`}
                              >
                                {p.description}
                              </p>
                              {p.alcoholWarning && (
                                <p className="text-[11px] font-bold text-[#FF6B5E] flex items-center gap-1 pt-0.5">
                                  <TriangleAlert className="w-3 h-3 shrink-0" />
                                  Venda proibida para menores de 18 anos
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="px-4 pb-4 flex items-center justify-between">
                            <PriceTag value={p.price} lightBg={isCreamSection} />
                            <button
                              type="button"
                              disabled={!p.available}
                              className="w-10 h-10 rounded-full bg-[#F7B518] hover:bg-[#FFD45C] text-[#2E0A3A] flex items-center justify-center shadow-md cursor-pointer"
                              aria-label={`Adicionar ${p.name}`}
                            >
                              <Plus className="w-5 h-5 stroke-[2.5]" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* MOSAIC / HIGHLIGHT LAYOUT */}
                  {(cat.layoutType === 'mosaic' || cat.layoutType === 'highlight') && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {catProducts.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => handleProductClick(p, cat.name)}
                          className={`rounded-[24px] p-3.5 border flex items-center gap-4 transition-all ${
                            p.available
                              ? 'cursor-pointer hover:-translate-y-0.5'
                              : 'opacity-45 grayscale cursor-not-allowed'
                          } ${
                            isCreamSection
                              ? 'bg-white border-[#4A1259]/15 shadow-md'
                              : 'bg-[#4A1259] border-[#62207A] shadow-lg'
                          }`}
                        >
                          <div className="w-24 h-24 rounded-2xl overflow-hidden shrink-0 relative">
                            <ProductBrandArtwork
                              categoryId={p.categoryId}
                              name={p.name}
                              imageUrl={p.imageUrl}
                              className="w-full h-full"
                            />
                            {!p.available && (
                              <div className="absolute inset-0 bg-black/65 flex items-center justify-center text-[10px] font-bold text-white">
                                ESGOTADO
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0 space-y-1">
                            {p.badge && <div>{renderBadge(p.badge)}</div>}
                            <h3 className="font-display text-base sm:text-lg font-bold leading-tight truncate">
                              {p.name}
                            </h3>
                            <p
                              className={`text-xs line-clamp-2 ${
                                isCreamSection ? 'text-[#4A1259]/75' : 'text-[#FFF4DC]/75'
                              }`}
                            >
                              {p.description}
                            </p>
                            <div className="flex items-center justify-between pt-1">
                              <PriceTag value={p.price} lightBg={isCreamSection} />
                              <span className="w-8 h-8 rounded-full bg-[#F7B518] text-[#2E0A3A] flex items-center justify-center">
                                <Plus className="w-4 h-4 stroke-[2.5]" />
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* LIST LAYOUT (HAMBURGUERIA) */}
                  {cat.layoutType === 'list' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      {catProducts.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => handleProductClick(p, cat.name)}
                          className={`rounded-2xl p-3.5 bg-[#4A1259] border border-[#62207A] flex items-center justify-between gap-3 transition-all ${
                            p.available
                              ? 'cursor-pointer hover:border-[#F7B518]'
                              : 'opacity-45 grayscale cursor-not-allowed'
                          }`}
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0">
                              <ProductBrandArtwork
                                categoryId={p.categoryId}
                                name={p.name}
                                imageUrl={p.imageUrl}
                                className="w-full h-full"
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <h3 className="font-display text-base font-bold truncate">
                                  {p.name}
                                </h3>
                                {p.badge && renderBadge(p.badge)}
                              </div>
                              <p className="text-xs text-[#FFF4DC]/70 line-clamp-2 mt-0.5">
                                {p.description}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1.5 shrink-0">
                            <PriceTag value={p.price} />
                            <span className="px-3 py-1 rounded-full bg-[#F7B518] text-[#2E0A3A] text-xs font-bold">
                              {p.available ? 'Adicionar' : 'Esgotado'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </React.Fragment>
          );
        })}

        {/* NOSSA CASA, NOSSA GENTE */}
        <SectionWaveDivider topColor="#2E0A3A" bottomColor="#FFF4DC" />
        <section className="bg-[#FFF4DC] text-[#2E0A3A] py-14 sm:py-20 px-4 sm:px-6">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 items-center gap-10">
            <div className="lg:col-span-6 space-y-4">
              <span className="font-script text-2xl text-[#62207A]">Nossa casa, nossa gente</span>
              <h2 className="font-display text-3xl sm:text-4xl font-extrabold leading-tight">
                Mais de 3 anos preparando cada tigela com carinho.
              </h2>
              <p className="text-base text-[#4A1259]/85 leading-relaxed">
                A Tropicália Açaí nasceu com o sabor acolhedor de feira tropical feita em família:
                frutas frescas escolhidas todo dia, açaí cremoso de verdade, sorvetes artesanais e
                lanches preparados na hora para chegar quentinhos ou geladinhos na sua mesa.
              </p>
            </div>

            <div className="lg:col-span-6">
              {settings.teamPhotos && settings.teamPhotos.length > 0 ? (
                <div className="grid grid-cols-2 gap-4">
                  {settings.teamPhotos.slice(0, 4).map((photo, idx) => (
                    <div
                      key={photo.id}
                      className={`rounded-3xl overflow-hidden border-4 border-white shadow-xl bg-white ${
                        idx % 2 === 0 ? '-rotate-2' : 'rotate-2 mt-4'
                      }`}
                    >
                      <img
                        src={photo.url}
                        alt={photo.caption || 'Equipe Tropicália Açaí'}
                        className="w-full h-44 object-cover"
                      />
                      {photo.caption && (
                        <p className="px-3 py-2 text-xs font-bold text-[#4A1259]">{photo.caption}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-3xl p-6 bg-[#4A1259] text-[#FFF4DC] -rotate-2 shadow-xl space-y-2">
                    <img
                      src={settings.logoUrl || '/assets/aistudio/image_82f9cbd7.png'}
                      alt="Tropicália Açaí"
                      className="w-16 h-16 rounded-full border-2 border-[#F7B518]"
                    />
                    <div className="font-display text-lg font-extrabold text-[#F7B518]">
                      Tradição local
                    </div>
                    <p className="text-xs text-[#FFF4DC]/80">
                      Mais de 3 anos servindo sabor, frescor e atendimento próximo.
                    </p>
                  </div>
                  <div className="rounded-3xl p-6 bg-[#F7B518] text-[#2E0A3A] rotate-2 mt-4 shadow-xl space-y-2">
                    <Sparkles className="w-8 h-8" />
                    <div className="font-display text-lg font-extrabold">Feito na hora</div>
                    <p className="text-xs font-semibold text-[#2E0A3A]/80">
                      Cada camada montada sob medida e entregue em 20 a 30 minutos.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="bg-[#2E0A3A] border-t border-[#62207A] pt-12 pb-24 md:pb-12 px-4 sm:px-6 text-[#FFF4DC]">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <img
                src={settings.logoUrl || '/assets/aistudio/image_82f9cbd7.png'}
                alt={settings.storeName}
                className="w-12 h-12 rounded-full border-2 border-[#F7B518]"
              />
              <div>
                <div className="font-display text-xl font-extrabold">{settings.storeName}</div>
                <div className="text-xs text-[#F7B518] font-bold">Mais de 3 anos de sabor</div>
              </div>
            </div>
            <p className="text-xs text-[#FFF4DC]/70 flex items-start gap-2">
              <MapPin className="w-4 h-4 text-[#F7B518] shrink-0 mt-0.5" />
              {settings.pickupAddress}
            </p>
          </div>

          <div className="space-y-2">
            <div className="font-display font-bold text-sm text-[#F7B518]">
              Horários de funcionamento
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-[#FFF4DC]/75">
              {DAY_NAMES.map((day, idx) => {
                const h = settings.openingHours[idx];
                return (
                  <div key={day} className="flex justify-between">
                    <span className="font-bold">{day}:</span>
                    <span>{h?.enabled ? `${h.open} - ${h.close}` : 'Fechado'}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <div className="font-display font-bold text-sm text-[#F7B518]">Contato e redes</div>
            <div className="flex flex-col gap-2 text-sm">
              <a
                href={`https://wa.me/${settings.whatsappNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 hover:text-[#3DDC84] transition-colors"
              >
                <MessageCircle className="w-4 h-4 text-[#3DDC84]" />
                WhatsApp (87) 98148-3783
              </a>
              <a
                href={`https://instagram.com/${settings.instagramHandle.replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 hover:text-[#D58BAE] transition-colors"
              >
                <Instagram className="w-4 h-4 text-[#D58BAE]" />
                {settings.instagramHandle}
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* Mobile Sticky Bottom Cart Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 p-3 bg-[#2E0A3A]/95 backdrop-blur-md border-t border-[#62207A]">
        <button
          type="button"
          onClick={totalCartItems > 0 ? onOpenCart : () => onOpenBuilder()}
          className="w-full min-h-[50px] px-5 rounded-full bg-[#F7B518] text-[#2E0A3A] font-display font-extrabold text-sm flex items-center justify-between shadow-lg shadow-[#F7B518]/30 cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4" />
            {totalCartItems > 0
              ? `Ver carrinho (${totalCartItems} ${totalCartItems === 1 ? 'item' : 'itens'})`
              : 'Montar meu açaí'}
          </span>
          <span className="tabular-nums">
            {totalCartItems > 0 ? `R$ ${formatBRL(totalCartPrice)}` : 'A partir de R$ 12,00'}
          </span>
        </button>
      </div>
    </div>
  );
};
