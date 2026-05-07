/** @type {import('tailwindcss').Config} */
import withMT from "@material-tailwind/react/utils/withMT.js";

export default withMT({
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        atd: {
          bg: '#0F1216',
          surface: '#1A1F26',
          'surface-2': '#232932',
          border: '#2E3540',
          'border-strong': '#3D4654',
          text: '#E6E8EB',
          'text-muted': '#8A93A1',
          'text-dim': '#5A6271',
          green: '#22C55E',
          'green-deep': '#16A34A',
          red: '#EF4444',
          'red-deep': '#DC2626',
          amber: '#E5B567',
          'amber-soft': '#F2D29B',
        },
      },
    },
  },
  plugins: [],
});
