interface ButtonProps {
  variant: 'alive' | 'dead' | 'hint' | 'copy';
  onClick: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
  children: React.ReactNode;
}

const variantClasses: Record<ButtonProps['variant'], string> = {
  alive:
    'bg-green-600 hover:bg-green-700 text-white uppercase tracking-wider disabled:bg-green-900 disabled:text-white/60',
  dead:
    'bg-red-600 hover:bg-red-700 text-white uppercase tracking-wider disabled:bg-red-900 disabled:text-white/60',
  hint:
    'bg-atd-surface-2 hover:bg-atd-surface text-atd-text-muted border border-atd-border disabled:opacity-40',
  copy: 'bg-atd-amber hover:bg-atd-amber-soft text-atd-bg',
};

const sizeByVariant: Record<ButtonProps['variant'], string> = {
  alive: 'px-4 py-4 text-lg',
  dead: 'px-4 py-4 text-lg',
  hint: 'px-4 py-3 text-sm',
  copy: 'px-4 py-3 text-sm',
};

export function Button({ variant, onClick, disabled = false, fullWidth = false, children }: ButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        ${sizeByVariant[variant]} font-bold transition-colors
        cursor-pointer disabled:cursor-not-allowed
        ${fullWidth ? 'w-full' : ''}
        ${variantClasses[variant]}
      `}
    >
      {children}
    </button>
  );
}
