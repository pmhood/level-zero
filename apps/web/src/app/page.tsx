import { Card, CardDescription, CardHeader, CardTitle } from '@level-zero/ui';

import { SystemStatus } from '@/components/system-status';
import { CreateProjectPanel } from '@/features/projects/create-project-panel';
import { ProjectList } from '@/features/projects/project-list';

const nextUp = [
  { issue: '#9', title: 'Reusable TipTap Level Zero editor' },
  { issue: '#12', title: 'Prototypes pinned to exact entity versions' },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-6 py-16">
      <header className="space-y-2">
        <p className="text-sm font-medium tracking-widest text-muted-foreground uppercase">
          Level Zero
        </p>
        <h1 className="text-3xl font-semibold">Ideas to Play.</h1>
        <p className="text-muted-foreground">
          A connected game-development workspace. Create a project, capture ideas in the Idea Lab,
          and promote what sticks into characters, mechanics and more.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Your projects</h2>
        <CreateProjectPanel />
        <ProjectList />
      </section>

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
