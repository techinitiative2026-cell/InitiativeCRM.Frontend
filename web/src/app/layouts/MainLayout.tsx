import { useState } from "react";

// With this:
import { HiMenu, HiX, HiUserGroup, HiShoppingCart, HiCog } from "react-icons/hi";
import Sidebar from "./Sidebar";

interface MainLayoutProps {
  children: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar component */}
      {/* <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} /> */}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
      <header className="bg-white shadow-md p-4 flex justify-between items-center md:justify-end">
  {/* Mobile menu button */}
  <button
    className="md:hidden text-gray-800 hover:text-gray-600 transition-colors"
    onClick={() => setSidebarOpen(!sidebarOpen)}
  >
    {sidebarOpen ? <HiX size={26} /> : <HiMenu size={26} />}
  </button>

  {/* Desktop items */}
  <div className="hidden md:flex items-center space-x-4">
    {/* Search bar */}
    <div className="relative">
      <input
        type="text"
        placeholder="Search..."
        className="pl-3 pr-10 py-1 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
      />
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
        🔍
      </span>
    </div>

    {/* Notifications */}
    <button className="relative text-gray-600 hover:text-gray-800 transition-colors">
      🔔
      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full px-1">3</span>
    </button>

    {/* Profile / Avatar */}
    <div className="relative">
      <button className="flex items-center gap-2 focus:outline-none">
        <img
          src="https://i.pravatar.cc/32"
          alt="avatar"
          className="w-8 h-8 rounded-full"
        />
        <span className="font-medium text-gray-600">Arrpith Shah</span>
      </button>
      {/* Dropdown (optional) */}
      {/* Add a dropdown menu here if needed */}
    </div>

    {/* Settings */}
    <button className="text-gray-600 hover:text-gray-800 transition-colors">
      ⚙️
    </button>

    {/* Logout */}
    <button className="bg-gradient-to-r from-purple-500 to-indigo-500 text-white px-4 py-1 rounded-lg shadow hover:from-purple-600 hover:to-indigo-600 transition-all">
      Logout
    </button>
  </div>
</header>


        {/* Page content */}
        <main className="font-lato flex-1 p-6 overflow-y-auto bg-gray-50 min-h-screen">
          {children}
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
