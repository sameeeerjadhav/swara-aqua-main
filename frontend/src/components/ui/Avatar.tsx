import { useState } from 'react';
import { getUploadUrl } from '../../api/axios';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZE_MAP: Record<AvatarSize, { outer: string; text: string; img: string }> = {
  xs: { outer: 'w-7 h-7',  text: 'text-xs',    img: 'w-7 h-7'  },
  sm: { outer: 'w-9 h-9',  text: 'text-sm',    img: 'w-9 h-9'  },
  md: { outer: 'w-12 h-12',text: 'text-lg',    img: 'w-12 h-12'},
  lg: { outer: 'w-16 h-16',text: 'text-2xl',   img: 'w-16 h-16'},
  xl: { outer: 'w-20 h-20',text: 'text-3xl',   img: 'w-20 h-20'},
};

interface AvatarProps {
  name: string;
  photo?: string | null;
  size?: AvatarSize;
  /** Tailwind classes for the outer wrapper (shape, gradient, etc.) */
  className?: string;
  /** Called when user clicks the avatar (e.g., to open file picker) */
  onClick?: () => void;
}

/**
 * Shows profile photo if available, otherwise shows the first letter of name.
 * Falls back gracefully to initial if image fails to load.
 */
export const Avatar = ({ name, photo, size = 'md', className = '', onClick }: AvatarProps) => {
  const [imgError, setImgError] = useState(false);
  const s = SIZE_MAP[size];
  const initial = name?.charAt(0)?.toUpperCase() || '?';

  const base = `${s.outer} rounded-2xl shrink-0 overflow-hidden flex items-center justify-center font-bold text-white ${className}`;

  if (photo && !imgError) {
    return (
      <div className={base + ' bg-gradient-to-br from-brand-500 to-aqua-400'} onClick={onClick}>
        <img
          src={getUploadUrl(photo)}
          alt={name}
          className={`${s.img} object-cover rounded-2xl`}
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={base + ' bg-gradient-to-br from-brand-500 to-aqua-400 shadow-sm'}
      onClick={onClick}
    >
      <span className={s.text}>{initial}</span>
    </div>
  );
};
