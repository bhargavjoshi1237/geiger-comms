import "./widget.css";

export const metadata = {
  title: "Geiger Comms",
  robots: { index: false, follow: false },
};

// The iframe shell: fixed to the viewport — the loader sizes the frame itself,
// and the messenger panel paints its own background from the gc-* tokens.
export default function WidgetLayout({ children }) {
  return <div className="h-screen w-full overflow-hidden">{children}</div>;
}
