import { OltProvider } from "./providers";
import { Shell } from "@/components/shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <OltProvider>
      <Shell>{children}</Shell>
    </OltProvider>
  );
}
