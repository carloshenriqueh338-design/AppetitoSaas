export const currency = (n: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n) || 0);

export const cn = (...classes: unknown[]): string =>
  classes.filter((c): c is string => typeof c === 'string' && c.length > 0).join(' ');

export const uid = (): string =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const timeAgo = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  return new Date(iso).toLocaleDateString('pt-BR');
};
