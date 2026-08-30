export const metadata = {
  title: "Geiger Comms",
  robots: { index: false, follow: false },
};

// The iframe shell: fixed to the viewport — the loader sizes the frame itself.
export default function WidgetLayout({ children }) {
  return <div className="h-screen w-full overflow-hidden bg-background text-foreground">{children}</div>;
}
