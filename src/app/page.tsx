import { AppShell } from '@/components/layout/AppShell';

/**
 * The only route. This Server Component renders the static shell markup on the
 * server (headline, navigation, CSS core) for an instant first paint; everything
 * stateful hydrates inside the AppShell client boundary.
 */
export default function Page() {
  return <AppShell />;
}
