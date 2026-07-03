import { OltProvider, SessionProvider } from "./providers";
import { Shell } from "@/components/shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <OltProvider>
        <Shell>{children}</Shell>
      </OltProvider>
    </SessionProvider>
  );
}
