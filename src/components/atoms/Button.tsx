interface ButtonProps {
  variant: 'alive' | 'dead' | 'hint' | 'copy';
  onClick: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
  children: React.ReactNode;
}

const variantClasses: Record<ButtonProps['variant'], string> = {
  alive: 'bg-green-600 hover:bg-green-700 text-white disabled:bg-green-200 disabled:text-green-400',
  dead: 'bg-red-600 hover:bg-red-700 text-white disabled:bg-red-200 disabled:text-red-400',
  hint: 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 disabled:opacity-40',
  copy: 'bg-blue-600 hover:bg-blue-700 text-white',
};

export function Button({ variant, onClick, disabled = false, fullWidth = false, children }: ButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        px-4 py-2 rounded-lg font-medium text-sm transition-colors
        cursor-pointer disabled:cursor-not-allowed
        ${fullWidth ? 'w-full' : ''}
        ${variantClasses[variant]}
      `}
    >
      {children}
    </button>
  );
}
