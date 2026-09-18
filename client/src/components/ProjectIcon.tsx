import { Hammer, Paintbrush, Sofa, TreeDeciduous, Car, Plane, Baby, PawPrint, Laptop, Wrench, Lightbulb, Bath, CookingPot, PiggyBank, Gift, Home, type LucideIcon } from 'lucide-react';
import { cx } from './ui';

const ICONS: Record<string, LucideIcon> = {
  hammer: Hammer,
  paintbrush: Paintbrush,
  sofa: Sofa,
  tree: TreeDeciduous,
  car: Car,
  plane: Plane,
  baby: Baby,
  paw: PawPrint,
  laptop: Laptop,
  wrench: Wrench,
  lightbulb: Lightbulb,
  bath: Bath,
  kitchen: CookingPot,
  piggy: PiggyBank,
  gift: Gift,
  home: Home,
};
export const PROJECT_ICONS = Object.keys(ICONS);

export function ProjectIcon({ icon, color, size }: { icon: string; color: string; size?: 'lg' | 'chip' }) {
  const Icon = ICONS[icon] ?? Hammer;
  if (size === 'chip') return <Icon size={16} style={{ color: 'var(--text-2)' }} />;
  return (
    <span className={cx('project-icon', size)} style={{ background: color }}>
      <Icon />
    </span>
  );
}
