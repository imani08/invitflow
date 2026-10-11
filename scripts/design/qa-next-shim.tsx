// Offline component QA only. Never imported by production code.
import React from 'react';
export function usePathname() { return '/events/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/designs'; }
export function useRouter() { return { push: (path: string) => { (window as unknown as { __qaNavigation: string }).__qaNavigation = path; } }; }
export function Link({ href, children, ...props }: React.PropsWithChildren<Record<string, unknown>>) { return <a href={String(href)} {...props}>{children}</a>; }
export function Image({ priority: _priority, fill: _fill, unoptimized: _unoptimized, ...props }: Record<string, unknown>) { return <img {...props} />; }
