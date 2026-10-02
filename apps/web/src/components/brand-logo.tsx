import Image from 'next/image';
import Link from 'next/link';

type BrandLogoProps = {
  variant?: 'full' | 'compact' | 'icon';
  href?: string;
  priority?: boolean;
  className?: string;
};

export function BrandLogo({ variant = 'full', href = '/', priority = false, className = '' }: BrandLogoProps) {
  const content = variant === 'icon' ? (
    <Image className="brand-logo-icon" src="/brand/invitaflow-icon-64.png" width={48} height={48} alt="InvitaFlow" priority={priority} />
  ) : variant === 'compact' ? (
    <>
      <Image className="brand-logo-compact" src="/brand/invitaflow-icon-64.png" width={44} height={44} alt="InvitaFlow" priority={priority} />
      <span className="brand-logo-wordmark">InvitaFlow</span>
    </>
  ) : (
    <picture className="brand-logo-picture">
      <source media="(max-width: 600px)" srcSet="/brand/invitaflow-icon-64.png 1x, /brand/invitaflow-icon-180.png 2x" />
      <Image className="brand-logo-horizontal" src="/brand/invitaflow-logo.png" width={235} height={69} alt="InvitaFlow" priority={priority} />
    </picture>
  );
  return <Link className={`brand-logo brand-logo--${variant} ${className}`.trim()} href={href} aria-label="InvitaFlow">{content}</Link>;
}
