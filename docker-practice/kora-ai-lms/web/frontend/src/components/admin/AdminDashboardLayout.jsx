import { useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { logoutUser } from "../../store/slicers/authSlice";
import AdminSidebar from "./AdminSidebar";
import AdminNavbar from "./AdminNavbar";

export default function AdminDashboardLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await dispatch(logoutUser());
    navigate("/admin/login");
  };

  return (
    <div className="h-full flex flex-col">
      <AdminNavbar
        setSidebarOpen={setSidebarOpen}
        setShowLogoutModal={setShowLogoutModal}
      />

      <div className="md:flex-1 md:flex md:min-w-0 bg-[#F9FAFB] ">
        <AdminSidebar
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          setShowLogoutModal={setShowLogoutModal}
        />

        <div className="flex-1 flex flex-col">
          <main className="flex-1 min-w-0 overflow-y-auto p-4 md:px-8 md:py-6">
            {children}
          </main>
        </div>
      </div>

      {/* Logout Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-90">
          <div className="bg-white rounded-xl shadow-xl w-96 p-6">
            <h2 className="text-lg font-semibold">Confirm Logout</h2>

            <p className="mt-2 text-gray-600">
              Are you sure you want to logout?
            </p>

            <div className="flex justify-end space-x-2 mt-6">
              <button
                onClick={() => setShowLogoutModal(false)}
                className="cursor-pointer px-4 py-2 border rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors duration-300"
              >
                Cancel
              </button>

              <button
                onClick={handleLogout}
                className="cursor-pointer px-4 py-2 bg-red-500 hover:bg-red-600 transition-colors duration-300 text-white rounded-lg"
              >
                Yes Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}