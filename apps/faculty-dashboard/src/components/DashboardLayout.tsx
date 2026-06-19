import { useNavigate } from 'react-router-dom'
import logo from '../assets/logo.png'
import { signOut } from '../lib/auth'
import { useSession } from '../hooks/useSession'

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user } = useSession()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <>
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src={logo} alt="Smidgeon" className="w-8 h-8 rounded-full" />
          <span className="font-bold text-gray-900 text-sm">Smidgeon</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-400">{user?.email}</span>
          <button
            onClick={handleSignOut}
            className="text-xs text-gray-500 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>
      <div>{children}</div>
    </>
  )
}
