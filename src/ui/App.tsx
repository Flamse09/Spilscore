import { Icon, type IconName } from './icons';
import { href, useRoute, type Route } from './router';
import { History } from './screens/History';
import { Home } from './screens/Home';
import { NewGame } from './screens/NewGame';
import { Play } from './screens/Play';
import { Players } from './screens/Players';
import { Settings } from './screens/Settings';
import { Stats } from './screens/Stats';
import { SyncBadge } from './SyncBadge';

const TABS: { label: string; icon: IconName; route: Route }[] = [
  { label: 'Hjem', icon: 'home', route: { name: 'home' } },
  { label: 'Spillere', icon: 'players', route: { name: 'players' } },
  { label: 'Historik', icon: 'history', route: { name: 'history' } },
  { label: 'Statistik', icon: 'stats', route: { name: 'stats' } },
  { label: 'Mere', icon: 'settings', route: { name: 'settings' } },
];

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'home':
      return <Home />;
    case 'new':
      return <NewGame />;
    case 'play':
      return <Play id={route.id} />;
    case 'players':
      return <Players />;
    case 'history':
      return <History />;
    case 'stats':
      return <Stats />;
    case 'settings':
      return <Settings />;
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
            <Icon name={t.icon} />
            <span>{t.label}</span>
          </a>
        ))}
      </nav>
    </>
  );
}
