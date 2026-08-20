import { HomepageBuilder } from './_components/homepage-builder';

/**
 * Server component by default — the interactive builder is the only client
 * boundary, and generation happens in the server action it calls.
 */
export default function Home() {
  return (
    <main className="flex-1 bg-zinc-50 dark:bg-black">
      <HomepageBuilder />
    </main>
  );
}
