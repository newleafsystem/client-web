import { useEffect, useMemo, useRef, useState } from 'react';

const HERO_VIDEO = {
  desktop: {
    id: 'EAjd5E5NK-A',
    title: 'NewLeaf System growth journey',
    poster: 'https://i.ytimg.com/vi/EAjd5E5NK-A/maxresdefault.jpg',
  },
  mobile: {
    id: 'HCBWTZTsNj0',
    title: 'NewLeaf System mobile overview',
    poster: 'https://i.ytimg.com/vi/HCBWTZTsNj0/maxresdefault.jpg',
  },
};

function getInitialVariant() {
  if (typeof window === 'undefined') return 'desktop';
  return window.matchMedia('(max-width: 768px)').matches ? 'mobile' : 'desktop';
}

function youtubeBackgroundSrc(videoId) {
  const params = new URLSearchParams({
    autoplay: '1',
    mute: '1',
    loop: '1',
    controls: '0',
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
    disablekb: '1',
    fs: '0',
    iv_load_policy: '3',
    cc_load_policy: '0',
    playlist: videoId,
    vq: 'hd1080',
  });
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

function shouldAvoidAutoplay() {
  if (typeof window === 'undefined') return false;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = navigator.connection?.saveData === true;
  return reducedMotion || saveData;
}

export function HeroBackgroundVideo() {
  const rootRef = useRef(null);
  const [variant, setVariant] = useState(getInitialVariant);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const video = HERO_VIDEO[variant];

  const src = useMemo(() => youtubeBackgroundSrc(video.id), [video.id]);

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

  return (
    <div
      ref={rootRef}
      className={`hero-bg-media hero-bg-media--${variant}${loaded ? ' is-loaded' : ''}`}
      style={{ '--hero-poster': `url(${video.poster})` }}
      aria-hidden="true"
    >
      {shouldLoad && (
        <iframe
          className="hero-bg-video"
          src={src}
          title={video.title}
          loading="lazy"
          tabIndex={-1}
          allow="autoplay; encrypted-media; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => setLoaded(true)}
        />
      )}
    </div>
  );
}
