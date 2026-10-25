import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);
  const isProduction = process.env.NODE_ENV === 'production';

  const publicDir = path.resolve(__dirname, 'public');
  const distDir = path.resolve(__dirname, 'dist');

  const staticOptions = {
    acceptRanges: true,
    cacheControl: false,
    setHeaders: (res: any, filePath: string) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Accept-Ranges', 'bytes');
      if (filePath.endsWith('.wasm')) {
        res.setHeader('Content-Type', 'application/wasm');
      } else if (filePath.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript');
      } else if (filePath.endsWith('.iso') || filePath.endsWith('.img') || filePath.endsWith('.bin')) {
        res.setHeader('Content-Type', 'application/octet-stream');
      }
    },
  };

  // Serve dist and public static assets with full byte-range support
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir, staticOptions));
  }
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir, staticOptions));
  }

  // Health endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', os: 'KolibriOS v86' });
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Fallback for SPA routing in production
    app.get('*', (req, res) => {
      const indexPath = path.resolve(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Application not built. Please run npm run build.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT} (Production: ${isProduction})`);
  });
}

startServer();
