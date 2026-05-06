import { useOrgBrandingContext } from '@/contexts/OrgBrandingContext';

interface BrandedLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showName?: boolean;
  nameClassName?: string;
}

const SIZES = {
  sm: 'w-8 h-8',
  md: 'w-9 h-9',
  lg: 'w-14 h-14',
} as const;

/**
 * Renders org logo when whitelabel is active, Tutlio logo otherwise.
 * Renders as a fragment (no wrapper div) to avoid nested-flex issues.
 */
export default function BrandedLogo({ size = 'md', showName = true, nameClassName = '' }: BrandedLogoProps) {
  const { enabled, logo_url, name } = useOrgBrandingContext();

  if (enabled && logo_url) {
    return (
      <>
        <img src={logo_url} alt={name} className={`${SIZES[size]} object-contain flex-shrink-0`} />
        {showName && <span className={`font-bold text-gray-900 text-base tracking-tight truncate ${nameClassName}`}>{name}</span>}
      </>
    );
  }

  return (
    <>
      <img src="/logo-icon.png" alt="Tutlio" className={`${SIZES[size]} rounded-xl flex-shrink-0`} />
      {showName && <span className={`font-black text-gray-900 text-base tracking-tight truncate ${nameClassName}`}>Tutlio</span>}
    </>
  );
}
