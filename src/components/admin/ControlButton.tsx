/**
 * Control Button Component
 * Action button with loading state
 */

'use client';

interface ControlButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  isLoading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}

export function ControlButton({
  children,
  onClick,
  isLoading = false,
  variant = 'primary',
  disabled = false,
}: ControlButtonProps) {
  const getStyles = () => {
    const base = {
      padding: '0.5rem 1rem',
      borderRadius: '6px',
      fontSize: '0.875rem',
      fontWeight: '500',
      border: 'none',
      cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
      opacity: disabled || isLoading ? 0.6 : 1,
      transition: 'all 0.2s',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.5rem',
    };

    const variants = {
      primary: {
        ...base,
        backgroundColor: '#2563eb',
        color: '#fff',
      },
      secondary: {
        ...base,
        backgroundColor: '#f3f4f6',
        color: '#374151',
      },
      danger: {
        ...base,
        backgroundColor: '#dc2626',
        color: '#fff',
      },
    };

    return variants[variant];
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || isLoading}
      style={getStyles()}
    >
      {isLoading && (
        <span
          style={{
            display: 'inline-block',
            width: '1rem',
            height: '1rem',
            border: '2px solid currentColor',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 0.6s linear infinite',
          }}
        />
      )}
      {children}
    </button>
  );
}
