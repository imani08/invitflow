import { cookies } from 'next/headers';
import { BrandLogo } from '@/components/brand-logo';
import { getSession, sessionCookieName } from '@/lib/auth-session';

type PublicBrandLogoProps = {
  variant?: 'full' | 'compact' | 'icon';
  priority?: boolean;
  className?: string;
};

/**
 * Keeps public pages useful to signed-in clients without changing the public
 * destination for visitors and invitation recipients.
 */
export async function PublicBrandLogo(props: PublicBrandLogoProps) {
  const sessionId = (await cookies()).get(sessionCookieName())?.value;
  const session = sessionId ? await getSession(sessionId).catch(() => null) : null;
  return <BrandLogo {...props} href={session ? '/dashboard' : '/'} />;
}
