export function LeafLoader({ label = 'Loading NewLeaf', compact = false }) {
  return (
    <div className={compact ? 'leaf-loader leaf-loader-compact' : 'leaf-loader'} role="status" aria-live="polite">
      <span className="leaf-loader-mark" aria-hidden="true">
        <span className="leaf-loader-ground" />
        <span className="leaf-loader-stem" />
        <span className="leaf-loader-sprout leaf-loader-sprout-left" />
        <span className="leaf-loader-sprout leaf-loader-sprout-right" />
        <span className="leaf-loader-canopy leaf-loader-canopy-left" />
        <span className="leaf-loader-canopy leaf-loader-canopy-top" />
        <span className="leaf-loader-canopy leaf-loader-canopy-right" />
      </span>
      <span className="leaf-loader-label">{label}</span>
    </div>
  );
}

export function PageLoader({ label = 'Loading NewLeaf' }) {
  return (
    <main className="nl-page-loader">
      <LeafLoader label={label} />
    </main>
  );
}

export function SectionLoader({ label = 'Loading', minHeight = 280 }) {
  return (
    <section className="nl-section-loader" style={{ minHeight }} aria-live="polite">
      <LeafLoader label={label} compact />
    </section>
  );
}
