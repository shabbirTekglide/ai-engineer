import { MdMenu } from "react-icons/md";
import { Link } from "react-router-dom";

const AdminNavbar = ({ setSidebarOpen, setShowLogoutModal }) => {
  return (
    <nav className="bg-background/80 backdrop-blur-md border-b sticky top-0 z-50 h-16">
      <div className="w-full px-6 h-full flex justify-between items-center">

        {/* LEFT */}
        <div className="flex items-center space-x-3">

          <button
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <MdMenu size={26} />
          </button>

          <Link to="/admin/dashboard">
            <img
              src="/login/assets/images/newImages/rubitt-lamp.png"
              alt="Logo"
              className="h-12"
            />
          </Link>
        </div>

        {/* Desktop Logout Only */}
        <button
          onClick={() => setShowLogoutModal(true)}
          className="cursor-pointer hidden lg:block px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600"
        >
          Logout
        </button>

      </div>
    </nav>
  );
};

export default AdminNavbar;