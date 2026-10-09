import { href, useRoute, type Route } from './router';
import { Home } from './screens/Home';
import { Settings } from './screens/Settings';
import { SyncBadge } from './SyncBadge';

const TABS: { label: string; route: Route }[] = [
  { label: 'Hjem', route: { name: 'home' } },
  { label: 'Historik', route: { name: 'history' } },
  { label: 'Statistik', route: { name: 'stats' } },
  { label: 'Indstillinger', route: { name: 'settings' } },
];

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'home':
      return <Home />;
    case 'settings':
      return <Settings />;
    default:
      return <p class="muted">Kommer snart.</p>;
  }
}

export function App() {
  const route = useRoute();
  return (
    <>
      <header class="top">
        <h1>Spilscore</h1>
        <SyncBadge />
      </header>
      <main>
        <Screen route={route} />
      </main>
      <nav class="bottom">
        {TABS.map((t) => (
          <a key={t.label} href={href(t.route)} class={route.name === t.route.name ? 'active' : ''}>
            {t.label}
          </a>
        ))}
      </nav>
    </>
  );
}
