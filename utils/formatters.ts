export const formatSeconds = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export const formatPlayerName = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) return '---';
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return trimmed;
  const firstInitial = parts[0].charAt(0);
  const rest = parts.slice(1).join(' ');
  return `${firstInitial ? `${firstInitial}.` : ''} ${rest}`.trim();
};
