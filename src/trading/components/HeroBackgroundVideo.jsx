import { useEffect, useMemo, useRef, useState } from 'react';
import { publicMediaUrl } from '../../shared/api/publicAssets';

const HERO_VIDEO = {
  desktop: {
    title: 'NewLeaf System growth journey',
    poster: 'https://i.ytimg.com/vi/EAjd5E5NK-A/maxresdefault.jpg',
    sources: [
      { src: publicMediaUrl('home/hero-desktop.m3u8'), type: 'application/vnd.apple.mpegurl' },
      { src: publicMediaUrl('home/hero-desktop.mp4'), type: 'video/mp4' },
    ],
  },
  mobile: {
    title: 'NewLeaf System mobile overview',
    poster: 'https://i.ytimg.com/vi/HCBWTZTsNj0/maxresdefault.jpg',
    sources: [
      { src: publicMediaUrl('home/hero-mobile.m3u8'), type: 'application/vnd.apple.mpegurl' },
      { src: publicMediaUrl('home/hero-mobile.mp4'), type: 'video/mp4' },
    ],
  },
};

function getInitialVariant() {
  if (typeof window === 'undefined') return 'desktop';
  return window.matchMedia('(max-width: 768px)').matches ? 'mobile' : 'desktop';
}

function shouldAvoidAutoplay() {
  if (typeof window === 'undefined') return false;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = navigator.connection?.saveData === true;
  return reducedMotion || saveData;
}

export function HeroBackgroundVideo() {
  const rootRef = useRef(null);
  const videoRef = useRef(null);
  const [variant, setVariant] = useState(getInitialVariant);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const video = HERO_VIDEO[variant];

  const sources = useMemo(() => video.sources, [video.sources]);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 768px)');
    const syncVariant = () => setVariant(query.matches ? 'mobile' : 'desktop');
    syncVariant();
    query.addEventListener?.('change', syncVariant);
    return () => query.removeEventListener?.('change', syncVariant);
  }, []);

  useEffect(() => {
    setLoaded(false);
    if (shouldAvoidAutoplay()) return;

    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: '600px 0px' }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [variant]);

  useEffect(() => {
    const node = videoRef.current;
    if (!node) return undefined;

    function syncPlayback() {
      if (document.hidden || shouldAvoidAutoplay()) {
        node.pause();
        return;
      }
      node.play().catch(() => {});
    }

    document.addEventListener('visibilitychange', syncPlayback);
    syncPlayback();
    return () => document.removeEventListener('visibilitychange', syncPlayback);
  }, [shouldLoad, variant]);

  return (
    <div
      ref={rootRef}
      className={`hero-bg-media hero-bg-media--${variant}${loaded ? ' is-loaded' : ''}`}
      style={{ '--hero-poster': `url(${video.poster})` }}
      aria-hidden="true"
    >
      {shouldLoad && (
        <video
          ref={videoRef}
          className="hero-bg-video"
          aria-label={video.title}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster={video.poster}
          tabIndex={-1}
          disablePictureInPicture
          controlsList="nodownload noplaybackrate noremoteplayback"
          onCanPlay={() => setLoaded(true)}
          onLoadedData={() => setLoaded(true)}
          onError={() => setLoaded(false)}
        >
          {sources.map((source) => (
            <source key={`${variant}-${source.type}`} src={source.src} type={source.type} />
          ))}
        </video>
      )}
    </div>
  );
}
