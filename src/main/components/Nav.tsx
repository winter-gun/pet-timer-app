import { NavLink } from 'react-router-dom';

const items = [
  { to: '/', label: '홈', end: true },
  { to: '/timer', label: '타이머' },
  { to: '/room', label: '공부방' },
  { to: '/goals', label: '목표' },
  { to: '/stats', label: '통계' },
  { to: '/settings', label: '설정' },
];

export default function Nav() {
  return (
    <nav className="border-b px-4 py-2 flex gap-1 bg-white">
      {items.map((i) => (
        <NavLink
          key={i.to}
          to={i.to}
          end={i.end}
          className={({ isActive }) =>
            `px-3 py-1.5 rounded text-sm transition ${
              isActive
                ? 'bg-blue-100 text-blue-700 font-medium'
                : 'text-gray-600 hover:bg-gray-100'
            }`
          }
        >
          {i.label}
        </NavLink>
      ))}
    </nav>
  );
}
