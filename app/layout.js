export const metadata = { title: "T2P Coach Platform", description: "Train to Perform — Programming, Tracking & Training" };
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="icon" href="/favicon.ico" />
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&family=Space+Mono:wght@700&display=swap" rel="stylesheet" />
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html { height: -webkit-fill-available; overflow: hidden; }
          body { overflow: hidden; -webkit-font-smoothing: antialiased; min-height: 100vh; min-height: -webkit-fill-available; min-height: 100dvh; }
          input, select, button, textarea { font-size: 16px !important; }
          @media (min-width: 769px) { input, select, button, textarea { font-size: 14px !important; } }
          .t2p-root {
            height: 100vh;
            height: -webkit-fill-available;
            height: 100dvh;
          }
          .t2p-mobile-header {
            padding-top: 12px;
            padding-top: max(12px, env(safe-area-inset-top, 12px));
          }
          .t2p-nav {
            padding-top: 24px;
            padding-top: max(24px, env(safe-area-inset-top, 24px));
          }
          .t2p-main {
            overflow: auto;
            -webkit-overflow-scrolling: touch;
          }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
