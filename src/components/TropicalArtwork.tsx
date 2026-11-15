import React from 'react';

export const SyrupDripTop: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`pointer-events-none w-full overflow-hidden leading-none ${className}`} aria-hidden="true">
    <svg
      viewBox="0 0 1440 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-14 sm:h-20 animate-drip"
      preserveAspectRatio="none"
    >
      <path
        d="M0 0H1440V32C1400 32 1388 68 1365 68C1342 68 1335 28 1300 28C1265 28 1254 88 1230 88C1206 88 1196 34 1152 34C1108 34 1098 56 1075 56C1052 56 1044 24 995 24C946 24 934 78 908 78C882 78 874 30 822 30C770 30 755 62 728 62C701 62 694 22 640 22C586 22 572 90 546 90C520 90 510 34 462 34C414 34 398 64 374 64C350 64 342 26 288 26C234 26 220 74 195 74C170 74 162 32 110 32C58 32 45 58 22 58C8 58 0 42 0 42V0Z"
        fill="url(#syrupGrad)"
      />
      <defs>
        <linearGradient id="syrupGrad" x1="720" y1="0" x2="720" y2="96" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#62207A" />
          <stop offset="100%" stopColor="#4A1259" />
        </linearGradient>
      </defs>
    </svg>
  </div>
);

export const SectionWaveDivider: React.FC<{ topColor: string; bottomColor: string; flip?: boolean }> = ({
  topColor,
  bottomColor,
  flip = false,
}) => (
  <div
    className="w-full overflow-hidden leading-none select-none"
    style={{ backgroundColor: topColor }}
    aria-hidden="true"
  >
    <svg
      viewBox="0 0 1440 72"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`w-full h-10 sm:h-14 block ${flip ? 'scale-x-[-1]' : ''}`}
      preserveAspectRatio="none"
    >
      <path
        d="M0 16C120 56 240 0 360 28C480 56 540 66 640 34C740 2 840 58 960 44C1080 30 1200 4 1320 34C1380 49 1416 40 1440 28V72H0V16Z"
        fill={bottomColor}
      />
    </svg>
  </div>
);

export const PalmFrondSVG: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg
    viewBox="0 0 240 220"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <path
      d="M12 12C82 32 146 86 218 196"
      stroke="#2F6B3D"
      strokeWidth="6"
      strokeLinecap="round"
    />
    <path d="M34 22C68 8 106 10 138 28C104 30 68 32 34 22Z" fill="#2F6B3D" />
    <path d="M58 38C102 22 148 28 184 54C144 50 100 48 58 38Z" fill="#3B824B" />
    <path d="M84 58C130 44 176 58 210 90C170 80 124 72 84 58Z" fill="#2F6B3D" />
    <path d="M110 82C154 74 196 92 226 128C188 112 148 98 110 82Z" fill="#3B824B" />
    <path d="M138 110C176 108 212 128 234 162C202 142 168 124 138 110Z" fill="#2F6B3D" />
    <path d="M24 34C10 68 14 106 32 138C34 104 34 68 24 34Z" fill="#2F6B3D" />
    <path d="M44 54C28 96 34 142 58 178C56 138 54 96 44 54Z" fill="#3B824B" />
    <path d="M68 78C54 122 66 168 96 202C88 162 80 120 68 78Z" fill="#2F6B3D" />
    <path d="M96 106C88 148 104 190 138 214C122 178 108 142 96 106Z" fill="#3B824B" />
  </svg>
);

export const BrandSplash: React.FC<{ logoUrl: string }> = ({ logoUrl }) => (
  <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#2E0A3A] text-[#FFF4DC]">
    <SyrupDripTop className="fixed top-0 left-0 right-0" />
    <PalmFrondSVG className="fixed -top-4 -left-6 w-44 h-44 opacity-60 animate-palm pointer-events-none" />
    <div className="relative flex flex-col items-center gap-5 px-6 text-center">
      <div className="relative">
        <div className="absolute -inset-4 rounded-full bg-[#F7B518]/20 blur-2xl" />
        <img
          src={logoUrl || '/assets/aistudio/image_82f9cbd7.png'}
          alt="Tropicália Açaí"
          className="relative w-28 h-28 sm:w-36 sm:h-36 rounded-full object-cover shadow-2xl border-4 border-[#F7B518]"
        />
      </div>
      <div className="space-y-1.5">
        <p className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[#FFF4DC]">
          Tropicália Açaí
        </p>
        <p className="font-script text-lg text-[#F7B518]">Preparando o cardápio fresquinho...</p>
      </div>
      <div className="w-44 h-1.5 rounded-full bg-[#4A1259] overflow-hidden">
        <div className="h-full w-1/2 rounded-full bg-[#F7B518] skeleton-shimmer" />
      </div>
    </div>
  </div>
);

export const ProductBrandArtwork: React.FC<{
  categoryId: string;
  name: string;
  imageUrl?: string;
  className?: string;
}> = ({ categoryId, name, imageUrl, className = 'w-full h-full' }) => {
  const [imgFailed, setImgFailed] = React.useState(false);

  if (imageUrl && !imgFailed) {
    return (
      <img
        src={imageUrl}
        alt={name}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className={`${className} object-cover`}
      />
    );
  }

  const lower = `${categoryId} ${name}`.toLowerCase();

  let bg = 'from-[#62207A] via-[#4A1259] to-[#2E0A3A]';
  let iconType: 'bowl' | 'cup' | 'icecream' | 'paleta' | 'salad' | 'shake' | 'drink' | 'burger' | 'fries' | 'soda' = 'bowl';

  if (lower.includes('sorv') || lower.includes('pote') || lower.includes('cestinha')) {
    bg = 'from-[#7A297B] via-[#4A1259] to-[#2E0A3A]';
    iconType = 'icecream';
  } else if (lower.includes('paleta') || lower.includes('pal-')) {
    bg = 'from-[#5B2076] via-[#3E104E] to-[#2E0A3A]';
    iconType = 'paleta';
  } else if (lower.includes('salada')) {
    bg = 'from-[#2F6B3D] via-[#4A1259] to-[#2E0A3A]';
    iconType = 'salad';
  } else if (lower.includes('milk') || lower.includes('shake')) {
    bg = 'from-[#6E267E] via-[#4A1259] to-[#2E0A3A]';
    iconType = 'shake';
  } else if (lower.includes('drink') || lower.includes('aperol') || lower.includes('espanhola') || lower.includes('limonada') || lower.includes('licor') || lower.includes('nevada')) {
    bg = 'from-[#822B68] via-[#4A1259] to-[#2E0A3A]';
    iconType = 'drink';
  } else if (lower.includes('burg') || lower.includes('x-')) {
    bg = 'from-[#69274C] via-[#4A1259] to-[#2E0A3A]';
    iconType = 'burger';
  } else if (lower.includes('batata') || lower.includes('fries') || lower.includes('overdose')) {
    bg = 'from-[#7D3A26] via-[#4A1259] to-[#2E0A3A]';
    iconType = 'fries';
  } else if (lower.includes('água') || lower.includes('coca') || lower.includes('fanta') || lower.includes('guaraná') || lower.includes('beb-')) {
    bg = 'from-[#5A206E] via-[#3F124F] to-[#2E0A3A]';
    iconType = 'soda';
  } else if (lower.includes('copo') || lower.includes('copinhos')) {
    iconType = 'cup';
  }

  return (
    <div
      className={`${className} relative flex items-center justify-center bg-gradient-to-br ${bg} overflow-hidden select-none`}
    >
      <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-[#F7B518]/15 blur-xl" />
      <div className="absolute -left-4 -bottom-4 w-20 h-20 rounded-full bg-[#D58BAE]/15 blur-lg" />
      <svg viewBox="0 0 120 120" className="w-3/5 h-3/5 drop-shadow-lg" fill="none">
        {iconType === 'bowl' && (
          <>
            <path d="M22 58C22 82 38 98 60 98C82 98 98 82 98 58H22Z" fill="#D98A3C" />
            <ellipse cx="60" cy="58" rx="38" ry="12" fill="#4A1259" stroke="#F7B518" strokeWidth="2.5" />
            <path d="M34 54C42 40 78 40 86 54C74 60 46 60 34 54Z" fill="#62207A" />
            <circle cx="48" cy="48" r="6" fill="#E83B4F" />
            <circle cx="63" cy="44" r="5.5" fill="#FFE066" />
            <circle cx="74" cy="50" r="5" fill="#88C946" />
          </>
        )}
        {iconType === 'cup' && (
          <>
            <path d="M38 36H82L74 98H46L38 36Z" fill="#4A1259" stroke="#F7B518" strokeWidth="2.5" />
            <path d="M40 52H80L78 66H42L40 52Z" fill="#FFF4DC" />
            <path d="M43 72H77L75 84H45L43 72Z" fill="#D58BAE" />
            <ellipse cx="60" cy="36" rx="22" ry="7" fill="#62207A" stroke="#F7B518" strokeWidth="2" />
            <circle cx="54" cy="32" r="5" fill="#E83B4F" />
            <circle cx="67" cy="33" r="4.5" fill="#F7B518" />
          </>
        )}
        {iconType === 'icecream' && (
          <>
            <path d="M42 60L60 104L78 60H42Z" fill="#E6A14A" stroke="#FFF4DC" strokeWidth="2" />
            <circle cx="50" cy="50" r="14" fill="#FFF4DC" />
            <circle cx="70" cy="50" r="14" fill="#D58BAE" />
            <circle cx="60" cy="37" r="15" fill="#F7B518" />
            <circle cx="60" cy="21" r="4.5" fill="#E83B4F" />
          </>
        )}
        {iconType === 'paleta' && (
          <>
            <rect x="55" y="76" width="10" height="26" rx="5" fill="#E6A14A" />
            <rect x="38" y="20" width="44" height="62" rx="22" fill="#D58BAE" stroke="#FFF4DC" strokeWidth="2.5" />
            <rect x="46" y="30" width="28" height="42" rx="14" fill="#F7B518" opacity="0.85" />
          </>
        )}
        {iconType === 'salad' && (
          <>
            <path d="M26 58C26 82 40 96 60 96C80 96 94 82 94 58H26Z" fill="#FFF4DC" />
            <circle cx="46" cy="50" r="9" fill="#E83B4F" />
            <circle cx="62" cy="46" r="9" fill="#F7B518" />
            <circle cx="74" cy="52" r="8" fill="#88C946" />
            <circle cx="56" cy="55" r="7" fill="#74B843" />
          </>
        )}
        {iconType === 'shake' && (
          <>
            <path d="M40 42H80L72 100H48L40 42Z" fill="#D58BAE" stroke="#FFF4DC" strokeWidth="2.5" />
            <path d="M40 42C40 28 80 28 80 42H40Z" fill="#FFF4DC" />
            <path d="M68 18L62 42" stroke="#F7B518" strokeWidth="4" strokeLinecap="round" />
          </>
        )}
        {iconType === 'drink' && (
          <>
            <path d="M36 42H84L75 98H45L36 42Z" fill="#FF6B5E" opacity="0.88" stroke="#FFF4DC" strokeWidth="2.5" />
            <circle cx="78" cy="40" r="10" fill="#F7B518" />
            <path d="M52 20L58 54" stroke="#3DDC84" strokeWidth="4" strokeLinecap="round" />
          </>
        )}
        {iconType === 'burger' && (
          <>
            <path d="M26 52C26 34 94 34 94 52H26Z" fill="#E8A24A" />
            <rect x="24" y="54" width="72" height="8" rx="4" fill="#3DDC84" />
            <rect x="26" y="63" width="68" height="12" rx="6" fill="#5A2A1A" />
            <path d="M28 63L42 73L56 63L72 73L88 63" stroke="#F7B518" strokeWidth="4" strokeLinecap="round" />
            <path d="M28 78H92C92 89 80 94 60 94C40 94 28 89 28 78Z" fill="#E8A24A" />
          </>
        )}
        {iconType === 'fries' && (
          <>
            <rect x="38" y="24" width="8" height="40" rx="3" fill="#FFD45C" />
            <rect x="50" y="18" width="8" height="46" rx="3" fill="#F7B518" />
            <rect x="62" y="22" width="8" height="42" rx="3" fill="#FFD45C" />
            <rect x="74" y="28" width="8" height="36" rx="3" fill="#F7B518" />
            <path d="M32 52H88L80 98H40L32 52Z" fill="#E83B4F" stroke="#FFF4DC" strokeWidth="2" />
          </>
        )}
        {iconType === 'soda' && (
          <>
            <rect x="42" y="24" width="36" height="72" rx="8" fill="#F7B518" stroke="#FFF4DC" strokeWidth="2.5" />
            <rect x="42" y="42" width="36" height="24" fill="#4A1259" />
            <circle cx="60" cy="54" r="6" fill="#FFF4DC" />
          </>
        )}
      </svg>
    </div>
  );
};
