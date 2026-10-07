import type { ReactNode } from 'react';
import { AdminNavigation } from './admin-navigation';

export function AdminShell({ roles, children }: { roles: string[]; children: ReactNode }) {
  return (
    <div className="admin-app">
      <AdminNavigation roles={roles} />
      <div className="admin-workspace">
        <header className="admin-topbar">
          <div>
            <span>INVITAFLOW · CONSOLE</span>
            <strong>Opérations &amp; pilotage</strong>
          </div>
          <p>Console administrative sécurisée</p>
        </header>
        <div className="admin-content">{children}</div>
      </div>
    </div>
  );
}
