/**
 * Generated demo faces for landing product animations (Dicebear notionists).
 * Not real people — layout filler only.
 */

export function demoAvatarUrl(seed: string, bg = 'e4e4e7'): string {
  return `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=${bg}`;
}

export function MiniAvatar({
  seed,
  alt,
  size = 'md',
  className = '',
  ring,
}: {
  seed: string;
  alt: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  ring?: boolean;
}) {
  const dim =
    size === 'xs' ? 'h-5 w-5' : size === 'sm' ? 'h-7 w-7' : size === 'lg' ? 'h-10 w-10' : 'h-9 w-9';
  return (
    <img
      src={demoAvatarUrl(seed)}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={`${dim} shrink-0 rounded-full object-cover bg-zinc-100 ${ring ? 'ring-2 ring-white shadow-sm' : ''} ${className}`}
    />
  );
}

export function AvatarStack({
  people,
  size = 'sm',
  max = 4,
}: {
  people: { seed: string; name: string }[];
  size?: 'xs' | 'sm' | 'md';
  max?: number;
}) {
  const shown = people.slice(0, max);
  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((p) => (
        <MiniAvatar key={p.seed} seed={p.seed} alt={p.name} size={size} ring />
      ))}
    </div>
  );
}
