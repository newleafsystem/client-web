import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { cpSync, createReadStream, existsSync, rmSync, statSync } from 'fs';

const WORKBENCH_SRC = path.resolve(__dirname, 'workbench');
const WORKBENCH_STATIC_PREFIX = '/workbench-static';

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.js') return 'text/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.png') return 'image/png';
  if (ext === '.svg') return 'image/svg+xml';
  return 'application/octet-stream';
}

/**
 * Copies raw Workbench HTML into dist/workbench-static after build.
 * React owns user-facing /workbench routes; these files are iframe content.
 */
function copyStaticApps() {
  return {
    name: 'copy-static-apps',
    configureServer(server) {
      server.middlewares.use(WORKBENCH_STATIC_PREFIX, (req, res, next) => {
        try {
          const requestPath = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
          const relativePath = requestPath.replace(/^\/+/, '');
          const filePath = path.resolve(WORKBENCH_SRC, relativePath);
          const rootWithSep = `${WORKBENCH_SRC}${path.sep}`;
          if (filePath !== WORKBENCH_SRC && !filePath.startsWith(rootWithSep)) {
            next();
            return;
          }
          const stat = statSync(filePath);
          if (!stat.isFile()) {
            next();
            return;
          }
          res.setHeader('Content-Type', contentTypeFor(filePath));
          createReadStream(filePath).pipe(res);
        } catch {
          next();
        }
      });
    },
    closeBundle() {
      const dest = path.resolve(__dirname, 'dist', 'workbench-static');
      if (existsSync(WORKBENCH_SRC)) {
        rmSync(dest, { recursive: true, force: true });
        cpSync(WORKBENCH_SRC, dest, { recursive: true });
        console.log('  Copied workbench/ -> dist/workbench-static/');
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), copyStaticApps()],
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: false, // preserve dist/picks/, dist/quant/, dist/desk/
  },
  resolve: {
    alias: {
      '@trading': path.resolve(__dirname, 'src/trading'),
      '@workbench': path.resolve(__dirname, 'src/workbench'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@picks': path.resolve(__dirname, 'src/picks'),
      '@app-firebase': path.resolve(__dirname, 'src/firebase'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/r2': {
        target: 'https://pub-04bbb919022645b3a3f318b2ebdf48c0.r2.dev',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/r2/, ''),
      },
    },
  },
});
