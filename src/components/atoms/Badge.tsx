interface BadgeProps {
  label: string;
  color: 'green' | 'red' | 'gray';
}

const colorClasses: Record<BadgeProps['color'], string> = {
  green: 'bg-green-100 text-green-800',
  red: 'bg-red-100 text-red-800',
  gray: 'bg-gray-100 text-gray-600',
};

export function Badge({ label, color }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${colorClasses[color]}`}>
      {label}
    </span>
  );
}
