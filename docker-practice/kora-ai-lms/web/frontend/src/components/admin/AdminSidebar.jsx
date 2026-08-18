import React from "react";
import { Link, useLocation } from "react-router-dom";
import { MdDashboard, MdRequestPage, MdOutlineVideoLibrary } from "react-icons/md";
import { FaUser } from "react-icons/fa";
import { MdClose } from "react-icons/md";

const AdminSidebar = ({ sidebarOpen, setSidebarOpen, setShowLogoutModal }) => {
  const location = useLocation();

  const navItems = [
    {
      id: 1,
      label: "Dashboard",
      path: "/admin/dashboard",
      icon: MdDashboard,
    },
    {
      id: 2,
      label: "Lecture pipeline",
      path: "/admin/lectures",
      icon: MdOutlineVideoLibrary,
    },
    {
      id: 3,
      label: "Integrations",
      path: "/admin/integrations",
      icon: MdRequestPage,
    },
    {
      id: 4,
      label: "Payments",
      path: "/admin/payments",
      icon: FaUser,
    },
    {
      id: 5,
      label: "Promocodes",
      path: "/admin/promocodes",
      icon: FaUser,
    },
    {
      id: 6,
      label: "Reference Codes",
      path: "/admin/reference-codes",
      icon: FaUser,
    },
  ];

  const isActive = (path) => location.pathname === path;

  return (
    <>
      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40  lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div
        className={`
    fixed lg:static top-0 left-0 z-50
    w-full lg:w-64 bg-white border-r border-gray-200
    h-screen lg:h-[calc(100vh-4rem)]
    transform transition-transform duration-300
    ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
    lg:translate-x-0
  `}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b lg:hidden">
          <span className="font-semibold text-gray-700">Menu</span>
          <button onClick={() => setSidebarOpen(false)}>
            <MdClose size={24} />
          </button>
        </div>
        <ul className="space-y-2 px-3 py-6">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);

            return (
              <li key={item.id}>
                <Link
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={`
                    flex items-center space-x-3 py-4 px-2 rounded-lg
                    ${
                      active
                        ? "bg-blue-50 text-[#427cf0] font-semibold"
                        : "text-gray-600 hover:bg-gray-100"
                    }
                  `}
                >
                  <Icon className="text-xl" />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="px-4 mt-6 lg:hidden">
          <button
            onClick={() => {
              setSidebarOpen(false);
              setShowLogoutModal(true);
            }}
            className="w-full py-3 rounded-lg bg-red-500 text-white hover:bg-red-600 transition"
          >
            Logout
          </button>
        </div>
      </div>
    </>
  );
};

export default AdminSidebar;
