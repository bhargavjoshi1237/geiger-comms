import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { SystemFavicon } from "@/components/system-favicon";
import { Toaster } from "@geiger/ui";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Comms - Geiger Studio",
  description:
    "One shared inbox for every customer conversation — email, chat, and social. The open-source Intercom alternative.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <SystemFavicon />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <div className="flex flex-col min-h-screen">{children}</div>
          <Toaster />
        </ThemeProvider>
        <Script id="geiger-comms-widget" strategy="lazyOnload">
          {`(function(){
          var BASE=${JSON.stringify(process.env.NEXT_PUBLIC_BASE_PATH || "")};
          // /widget (the messenger iframe) renders through this same root layout,
          // so booting there mounts a second launcher inside the messenger itself.
          var here=location.pathname.slice(BASE.length);
          if(here==='/widget'||here.indexOf('/widget/')===0)return;
          // One loader per page: WidgetTestLauncher shares this id, so whichever
          // runs first wins instead of both building their own launcher.
          if(document.getElementById('geiger-comms-widget-loader'))return;
          var w=window,g=w.GeigerComms;if(!g){g=function(){g.q.push(arguments)};
          g.q=[];w.GeigerComms=g}var s=document.createElement('script');
          s.id='geiger-comms-widget-loader';
          s.src=location.origin+BASE+'/widget/v1.js';s.async=1;
          document.head.appendChild(s);
          w.GeigerComms('boot', { appId: 'wg_4aee88wt' });})();`}
        </Script>
      </body>
    </html>
  );
}
