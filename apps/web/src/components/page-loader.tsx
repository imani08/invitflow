import { BrandLogo } from '@/components/brand-logo';

type PageLoaderProps = {
  label?: string;
  fullScreen?: boolean;
};

export function PageLoader({ label = 'Préparation de votre espace…', fullScreen = false }: PageLoaderProps) {
  return (
    <div className={`if-page-loader${fullScreen ? ' if-page-loader--screen' : ''}`} role="status" aria-live="polite">
      <span className="if-page-loader__accessible">{label}</span>
      <div className="if-page-loader__brand">
        <BrandLogo variant="icon" href="/" priority className="if-page-loader__logo" />
        <span className="if-page-loader__wordmark" aria-hidden="true">InvitaFlow</span>
      </div>
      <span className="if-page-loader__ornament" aria-hidden="true"><span /></span>
      <span className="if-page-loader__label" aria-hidden="true">{label}</span>
    </div>
  );
}
