import { Card, CardDescription, CardHeader, CardTitle } from '@level-zero/ui';

import { SystemStatus } from '@/components/system-status';

const nextUp = [
  { issue: '#4', title: 'Entity versioning and creative branching' },
  { issue: '#5', title: 'Asset model and object storage' },
  { issue: '#9', title: 'Reusable TipTap Workbench editor' },
  { issue: '#11', title: 'First Project and Idea Lab vertical slice' },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-6 py-16">
      <header className="space-y-2">
        <p className="text-sm font-medium tracking-widest text-muted-foreground uppercase">
          Level Zero
        </p>
        <h1 className="text-3xl font-semibold">Workbench</h1>
        <p className="text-muted-foreground">
          A connected game-development workspace. This shell is the bootstrap slice: the monorepo,
          the API, the worker, and the shared packages the rest of the product is built on.
        </p>
      </header>

      <SystemStatus />

      <Card>
        <CardHeader>
          <CardTitle>Next up</CardTitle>
          <CardDescription>
            Feature modules are added to the monolith as these issues land.
          </CardDescription>
        </CardHeader>
        <ul className="divide-y divide-border text-sm">
          {nextUp.map((item) => (
            <li key={item.issue} className="flex gap-4 py-2">
              <span className="w-10 shrink-0 font-mono text-muted-foreground">{item.issue}</span>
              <span>{item.title}</span>
            </li>
          ))}
        </ul>
      </Card>
    </main>
  );
}
