import { useEffect, useState } from 'react';

interface Props {
  onDone: () => void;
}

export const SplashScreen = ({ onDone }: Props) => {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    // Start fade-out after 2.2s, then call onDone after the fade completes
    const fadeTimer  = setTimeout(() => setLeaving(true), 2200);
    const doneTimer  = setTimeout(() => onDone(),         2700);
    return () => { clearTimeout(fadeTimer); clearTimeout(doneTimer); };
  }, [onDone]);

  return (
    <div
      style={{
        position:        'fixed',
        inset:           0,
        display:         'flex',
        flexDirection:   'column',
        alignItems:      'center',
        justifyContent:  'center',
        backgroundColor: '#ffffff',
        zIndex:          9999,
        gap:             16,
        opacity:         leaving ? 0 : 1,
        transition:      'opacity 0.5s ease',
      }}
    >
      {/* ── Rotating logo ── */}
      <div
        style={{
          width:     140,
          height:    140,
          animation: 'splashSpin 0.8s cubic-bezier(0.34,1.56,0.64,1) both',
        }}
      >
        <img
          src="/icons/justlogo.png"
          alt="Logo"
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      </div>

      {/* ── Name slides up after logo settles ── */}
      <div
        style={{
          width:     200,
          animation: 'splashFadeUp 0.5s ease 0.6s both',
          opacity:   0,
        }}
      >
        <img
          src="/icons/justname.png"
          alt="Sarvam Enterprises"
          style={{ width: '100%', objectFit: 'contain' }}
        />
      </div>

      {/* ── Keyframes ── */}
      <style>{`
        @keyframes splashSpin {
          0%   { opacity: 0; transform: rotate(-200deg) scale(0.3); }
          80%  { opacity: 1; transform: rotate(10deg)   scale(1.05); }
          100% { opacity: 1; transform: rotate(0deg)    scale(1);    }
        }
        @keyframes splashFadeUp {
          0%   { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0);    }
        }
      `}</style>
    </div>
  );
};
