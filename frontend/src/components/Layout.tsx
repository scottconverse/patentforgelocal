import { Link, Outlet, useLocation } from 'react-router-dom';

export default function Layout() {
  const location = useLocation();
  const isProjects = location.pathname === '/' || location.pathname.startsWith('/projects');
  const isSettings = location.pathname === '/settings';

  return (
    <div className="min-h-screen flex flex-col bg-gray-950 text-gray-100">
      <nav className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <Link to="/" className="text-xl font-bold text-blue-400 hover:text-blue-300 transition-colors">
          PatentForge
        </Link>
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className={`text-sm transition-colors ${isProjects ? 'text-blue-400' : 'text-gray-400 hover:text-gray-200'}`}
          >
            Projects
          </Link>
          <Link
            to="/settings"
            className={`text-sm transition-colors ${isSettings ? 'text-blue-400' : 'text-gray-400 hover:text-gray-200'}`}
          >
            Settings
          </Link>
        </div>
      </nav>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
