export function InvestProductEyebrow({ children, style }) {
  return (
    <p style={{
      fontFamily: "'Space Mono', monospace",
      fontSize: 10,
      letterSpacing: '.15em',
      textTransform: 'uppercase',
      color: 'rgba(255,255,255,.42)',
      marginBottom: 10,
      ...style,
    }}>
      {children}
    </p>
  );
}
