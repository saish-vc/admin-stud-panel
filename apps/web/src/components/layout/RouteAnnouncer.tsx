import * as React from 'react';
import { useLocation } from 'react-router-dom';

const TITLES: Array<[RegExp, string]> = [
  [/^\/$/, 'NTTF Student Certificate Portal'],
  [/^\/verify$/, 'Verify a certificate'],
  [/^\/verify\//, 'Certificate verification'],
  [/^\/login$/, 'Student sign in'],
  [/^\/admin\/login$/, 'Staff sign in'],
  [/^\/change-password$/, 'Change password'],
  [/^\/student$/, 'Student overview'],
  [/^\/student\/new$/, 'New certificate request'],
  [/^\/student\/requests\/[^/]+$/, 'Request details'],
  [/^\/student\/requests$/, 'My requests'],
  [/^\/student\/profile$/, 'My profile'],
  [/^\/admin$/, 'Administration overview'],
  [/^\/admin\/requests\/[^/]+$/, 'Request review'],
  [/^\/admin\/requests$/, 'Request queue'],
];

function titleFor(pathname: string): string {
  return TITLES.find(([pattern]) => pattern.test(pathname))?.[1] ?? 'Page not found';
}

export function RouteAnnouncer() {
  const location = useLocation();
  const title = titleFor(location.pathname);
  const [announcement, setAnnouncement] = React.useState('');

  React.useEffect(() => {
    document.title = `${title} · NTTF Certificate Portal`;
    setAnnouncement(`${title} page loaded`);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname, title]);

  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true">
      {announcement}
    </div>
  );
}
