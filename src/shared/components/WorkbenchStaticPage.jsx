import { useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { SectionLoader } from './LeafLoader';

const WORKBENCH_PAGES = {
  index: 'index',
  admin: 'admin',
  'all-stocks': 'all-stocks',
  'bear-call': 'bear-call',
  'bear-put': 'bear-put',
  'broken-wing': 'broken-wing',
  'bull-call': 'bull-call',
  'bull-put': 'bull-put',
  calendar: 'calendar',
  'condor-scanner': 'condor-scanner',
  'options-live': 'options-live',
  projection: 'projection',
  'sell-puts': 'sell-puts',
  status: 'status',
  stock: 'stock',
  'strategy-builder': 'strategy-builder',
  'strategy-logic': 'strategy-logic',
  watchlist: 'watchlist',
  wheel: 'wheel',
};

function normalizeSlug(value) {
  return String(value || 'index')
    .replace(/\.html$/i, '')
    .replace(/^\/+|\/+$/g, '') || 'index';
}

function staticPageSrc(file, location) {
  const params = new URLSearchParams(location.search);
  params.set('embedded', '1');
  const search = params.toString();
  return `/workbench-static/${file}.html${search ? `?${search}` : ''}${location.hash || ''}`;
}

export default function WorkbenchStaticPage({ page }) {
  const { staticPage } = useParams();
  const location = useLocation();
  const slug = normalizeSlug(page || staticPage);
  const file = WORKBENCH_PAGES[slug];
  const [loaded, setLoaded] = useState(false);
  const [height, setHeight] = useState(900);

  const src = useMemo(() => (
    file ? staticPageSrc(file, location) : ''
  ), [file, location.search, location.hash]);

  useEffect(() => {
    setLoaded(false);
    setHeight(900);
  }, [src]);

  useEffect(() => {
    function onMessage(event) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== 'newleaf:workbench-height') return;
      const nextHeight = Number(event.data.height);
      if (Number.isFinite(nextHeight) && nextHeight > 0) {
        setHeight(Math.max(640, Math.ceil(nextHeight)));
      }
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  if (!file) {
    return <Navigate to="/workbench" replace />;
  }

  return (
    <main
      className="nl-workbench-static-shell"
      style={{
        position: 'relative',
        background: '#f7f5ef',
        minHeight: 'calc(100vh - 160px)',
      }}
    >
      {!loaded && <SectionLoader label="Loading Workbench" minHeight={420} />}
      <iframe
        key={src}
        title={`NewLeaf Workbench ${slug}`}
        src={src}
        onLoad={() => setLoaded(true)}
        style={{
          display: loaded ? 'block' : 'none',
          width: '100%',
          height,
          minHeight: 640,
          border: 0,
          background: '#f7f5ef',
        }}
      />
    </main>
  );
}
