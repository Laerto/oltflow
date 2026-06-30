import { Inbox } from "lucide-react";

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-12 text-center text-sm text-muted-foreground">
      <Inbox className="h-10 w-10 text-muted-foreground/50" />
      <div>{children}</div>
    </div>
  );
}
