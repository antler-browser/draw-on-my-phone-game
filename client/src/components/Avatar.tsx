interface AvatarProps {
  avatar: string | null;
  name: string | null;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: {
    container: 'w-10 h-10',
    text: 'text-lg',
    border: 'border-2',
  },
  md: {
    container: 'w-16 h-16',
    text: 'text-2xl',
    border: 'border-3',
  },
  lg: {
    container: 'w-32 h-32',
    text: 'text-5xl',
    border: 'border-4',
  },
}

export function Avatar({ avatar, name, size = 'lg' }: AvatarProps) {
  const classes = sizeClasses[size]
  const wrapperClass = size === 'lg' ? 'mb-8' : ''

  if ( !name && !avatar) { return <></> }

  return (
    <>
      {avatar ? (
        <div className={wrapperClass}>
          <img
            src={avatar}
            alt={name || ''}
            className={`${classes.container} rounded-full ${size === 'lg' ? 'mx-auto' : ''} shadow-lg ${classes.border} border-white object-cover`}
          />
        </div>
      ) : (
        <div className={wrapperClass}>
          <div className={`${classes.container} rounded-full ${size === 'lg' ? 'mx-auto' : ''} shadow-md ${classes.border} border-white bg-rose-800 flex items-center justify-center ${classes.text} text-white font-bold`}>
            {name?.charAt(0).toUpperCase() || ''}
          </div>
        </div>
      )}
    </>
  );
}

