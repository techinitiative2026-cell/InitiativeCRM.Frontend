import { NavLink } from "react-router-dom";
import { HiUserGroup, HiShoppingCart, HiCog, HiHome, HiChartBar, HiUser, HiChatAlt2, HiFolder, HiClock, HiClipboardList } from "react-icons/hi";

interface SidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

const Sidebar = ({ sidebarOpen, setSidebarOpen }: SidebarProps) => {
 const menuItems = [
  { name: "Dashboard", path: "/", icon: <HiHome /> },

  { name: "Leads", path: "/leads", icon: <HiUserGroup /> },

  { name: "Projects", path: "/projects", icon: <HiClipboardList /> },

  { name: "Tasks", path: "/tasks", icon: <HiClipboardList /> },

  { name: "Timesheets", path: "/timesheets", icon: <HiClock /> },

  { name: "Files", path: "/files", icon: <HiFolder /> },

  { name: "Messages", path: "/messages", icon: <HiChatAlt2 /> },

  { name: "Clients", path: "/clients", icon: <HiUser /> },

  { name: "Reports", path: "/reports", icon: <HiChartBar /> },
];

  return (
    <>
      {/* Mobile sidebar overlay */}
      <div
        className={`fixed inset-0 z-30 bg-black bg-opacity-50 transition-opacity md:hidden ${
          sidebarOpen ? "block" : "hidden"
        }`}
        onClick={() => setSidebarOpen(false)}
      ></div>

      {/* Sidebar */}
      <aside
        className={`fixed z-40 inset-y-0 left-0 w-64 bg-gray-900 text-white transform transition-transform duration-300 md:static md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="text-3xl text-center  font-bold p-4 border-b border-gray-800">
        </div>
        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {menuItems.map((item) => (
              <li key={item.name}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center gap-2 py-2 px-3 rounded hover:bg-gray-700 transition ${
                      isActive ? "bg-gray-700 font-bold" : ""
                    }`
                  }
                  onClick={() => setSidebarOpen(false)} // closes mobile sidebar
                >
                  <span className="text-xl">{item.icon}</span>
                  <span>{item.name}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="p-4 border-t border-gray-800">
          <div className="text-sm text-gray-400">Logged in as <strong>Arrpith Shah</strong></div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
