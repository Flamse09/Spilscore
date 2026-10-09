import { useEffect, useState } from 'preact/hooks';

export type Route =
  | { name: 'home' }
  | { name: 'new' }
  | { name: 'play'; id: string }
  | { name: 'history' }
  | { name: 'stats' }
  | { name: 'settings' };

export function parseRoute(hash: string): Route {
  const [, first, second] = hash.replace(/^#/, '').split('/');
  switch (first) {
    case 'new':
    case 'history':
    case 'stats':
    case 'settings':
      return { name: first };
    case 'play':
      return second ? { name: 'play', id: second } : { name: 'home' };
    default:
      return { name: 'home' };
  }
}

export function href(r: Route): string {
  if (r.name === 'home') return '#/';
  if (r.name === 'play') return `#/play/${r.id}`;
  return `#/${r.name}`;
}

export function navigate(r: Route): void {
  location.hash = href(r);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
