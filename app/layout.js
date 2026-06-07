export const metadata = { title: "Train To Perform", description: "Train to Perform — Programming, Tracking & Training" };
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black" />
        <meta name="apple-mobile-web-app-title" content="T2P" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#18181B" />
        <meta name="application-name" content="Train To Perform" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png" />
        <link rel="icon" href="/favicon.ico" />
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&family=Space+Mono:wght@700&display=swap" rel="stylesheet" />
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html { height: -webkit-fill-available; overflow: hidden; max-width: 100vw; }
          body { overflow: hidden; -webkit-font-smoothing: antialiased; min-height: 100vh; min-height: -webkit-fill-available; min-height: 100dvh; max-width: 100vw; overflow-x: hidden; }
          input, select, button, textarea { font-size: 16px !important; }
          @media (min-width: 769px) { input, select, button, textarea { font-size: 14px !important; } }
          .t2p-root {
            height: 100vh;
            height: -webkit-fill-available;
            height: 100dvh;
            max-width: 100vw;
            overflow-x: hidden;
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
            overflow-x: hidden;
            -webkit-overflow-scrolling: touch;
            max-width: 100%;
          }
          /* PWA standalone mode adjustments */
          @media (display-mode: standalone) {
            .t2p-mobile-header {
              padding-top: max(16px, env(safe-area-inset-top, 16px));
            }
            .t2p-nav {
              padding-top: max(28px, env(safe-area-inset-top, 28px));
            }
          }
        `}</style>
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
              navigator.serviceWorker.register('/sw.js').catch(function() {});
            });
          }
        `}} />
      </head>
      <body>{children}</body>
    </html>
  );
}
