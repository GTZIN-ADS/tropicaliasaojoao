import { StoreSettings } from '../types';

export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatCurrencyParts(value: number): { symbol: string; amount: string } {
  return {
    symbol: 'R$',
    amount: formatBRL(value),
  };
}

export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function maskWhatsapp(raw: string): string {
  const digits = normalizePhone(raw).slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function computeStoreOpen(settings: StoreSettings, now = new Date()): boolean {
  if (settings.manualOpenOverride === 'open') return true;
  if (settings.manualOpenOverride === 'closed') return false;

  const brParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Recife',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const weekdayStr = brParts.find((p) => p.type === 'weekday')?.value || 'Mon';
  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const day = dayMap[weekdayStr] ?? now.getDay();
  const hour = Number(brParts.find((p) => p.type === 'hour')?.value ?? now.getHours());
  const minute = Number(brParts.find((p) => p.type === 'minute')?.value ?? now.getMinutes());

  const currentMinutes = (hour === 24 ? 0 : hour) * 60 + minute;

  const schedule = settings.openingHours[day];
  if (schedule && schedule.enabled) {
    const [openH, openM] = schedule.open.split(':').map(Number);
    const [closeH, closeM] = schedule.close.split(':').map(Number);
    if (!Number.isNaN(openH) && !Number.isNaN(closeH)) {
      const openMinutes = openH * 60 + (openM || 0);
      let closeMinutes = closeH * 60 + (closeM || 0);
      if (closeMinutes <= openMinutes) {
        closeMinutes += 24 * 60;
      }
      if (currentMinutes >= openMinutes && currentMinutes <= closeMinutes) {
        return true;
      }
    }
  }

  // Check overnight spillover from yesterday (e.g. yesterday 14:00 -> 00:59)
  const prevDay = (day + 6) % 7;
  const prevSchedule = settings.openingHours[prevDay];
  if (prevSchedule && prevSchedule.enabled) {
    const [pOpenH, pOpenM] = prevSchedule.open.split(':').map(Number);
    const [pCloseH, pCloseM] = prevSchedule.close.split(':').map(Number);
    if (!Number.isNaN(pOpenH) && !Number.isNaN(pCloseH)) {
      const pOpenMin = pOpenH * 60 + (pOpenM || 0);
      const pCloseMin = pCloseH * 60 + (pCloseM || 0);
      if (pCloseMin <= pOpenMin && currentMinutes <= pCloseMin) {
        return true;
      }
    }
  }

  return false;
}

function tlv(id: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

function sanitizePixText(text: string, maxLen: number): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .trim()
    .slice(0, maxLen)
    .toUpperCase();
}

function crc16ccitt(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function generatePixPayload(params: {
  pixKey: string;
  receiverName: string;
  receiverCity: string;
  amount: number;
  txId: string;
}): string {
  const cleanKey = params.pixKey.startsWith('+')
    ? `+${params.pixKey.replace(/\D/g, '')}`
    : params.pixKey.trim();

  const merchantAccountInfo =
    tlv('00', 'br.gov.bcb.pix') + tlv('01', cleanKey);

  const name = sanitizePixText(params.receiverName || 'TROPICALIA ACAI', 25) || 'TROPICALIA ACAI';
  const city = sanitizePixText(params.receiverCity || 'PETROLINA', 15) || 'BRASIL';
  const amountStr = params.amount.toFixed(2);
  const txId = (params.txId || 'TROPICALIA').replace(/[^a-zA-Z0-9]/g, '').slice(0, 25) || '***';

  const additionalData = tlv('05', txId);

  const payloadWithoutCrc =
    tlv('00', '01') +
    tlv('26', merchantAccountInfo) +
    tlv('52', '0000') +
    tlv('53', '986') +
    tlv('54', amountStr) +
    tlv('58', 'BR') +
    tlv('59', name) +
    tlv('60', city) +
    tlv('62', additionalData) +
    '6304';

  const crc = crc16ccitt(payloadWithoutCrc);
  return payloadWithoutCrc + crc;
}

export function formatElapsedTime(isoDate: string): { label: string; level: 'ok' | 'warn' | 'late' } {
  const diffMs = Math.max(0, Date.now() - new Date(isoDate).getTime());
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return { label: 'agora', level: 'ok' };
  if (mins < 15) return { label: `${mins} min`, level: 'ok' };
  if (mins < 28) return { label: `${mins} min`, level: 'warn' };
  return { label: `${mins} min`, level: 'late' };
}
