import { Link, useLocation } from "react-router-dom";
import {
  Settings,
  Bell,
  Menu,
  X,
  LayoutDashboard,
  Calendar,
  BookOpen,
  Brain,
  Mic,
  UserRound,
} from "lucide-react";
import { MdQuestionMark } from "react-icons/md";
import { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { GrDocumentText } from "react-icons/gr";

export function Sidebar() {
  const { profile } = useSelector((s) => s.studentprofile || {});
  const location = useLocation();

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (isMobile && isDrawerOpen) {
      document.body.style.overflow = "hidden";
      document.body.style.touchAction = "none";
    } else {
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
    }

    // Cleanup on unmount
    return () => {
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
    };
  }, [isMobile, isDrawerOpen]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");

    // Set initial value
    setIsMobile(mediaQuery.matches);

    // Update on resize
    const handleChange = (e) => {
      setIsMobile(e.matches);
      // Close drawer when switching to desktop
      if (!e.matches) {
        setIsDrawerOpen(false);
      }
    };

    mediaQuery.addEventListener("change", handleChange);

    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  // ✅ CLOSE drawer AFTER navigation on mobile
  useEffect(() => {
    if (isMobile) {
      setIsDrawerOpen(false);
    }
  }, [location.pathname, isMobile]);

  const toggleDrawer = () => {
    setIsDrawerOpen((prev) => !prev);
  };

  const closeDrawer = () => {
    setIsDrawerOpen(false);
  };

  const mainNavLinks = [
    { to: "/student/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/student/calendar", icon: Calendar, label: "Calendar" },
    { to: "/student/my-classes", icon: BookOpen, label: "My Classes" },
    { to: "/student/study", icon: Brain, label: "Learn" },
    { to: "/student/upload-lecture", icon: Mic, label: "Record Lecture" },
    { to: "/student/upload-document", icon: GrDocumentText, label: "Upload Document" },
  ];

  const secondaryNavLinks = [
    {
      to: "https://rubitt.freshdesk.com/",
      icon: MdQuestionMark,
      label: "Support",
      newTab: true,
    },
    {
      to: "/student/notifications",
      icon: Bell,
      label: "Notifications",
      newTab: false,
    },
    {
      to: "/student/settings",
      icon: Settings,
      label: "Settings",
      newTab: false,
    },
    {
      to: "/student/profile",
      icon: UserRound,
      label: "Profile Dashboard",
      type: "profile",
      newTab: false,
    },
  ];

  const isActiveRoute = (path) => {
    if (path === "/student/dashboard") {
      return location.pathname === path;
    }
    return location.pathname.startsWith(path);
  };

  return (
    <>
      {/* Overlay */}
      {isMobile && isDrawerOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
          onClick={closeDrawer}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          md:w-16 flex flex-col py-6 bg-white shadow-lg
          md:relative md:translate-x-0 md:border-r md:h-screen
          ${isMobile
            ? "fixed top-0 right-0 h-full w-full z-[9999] transform transition-transform duration-300"
            : ""
          }
          ${isMobile && !isDrawerOpen ? "translate-x-full" : "translate-x-0"}
        `}
      >
        {/* Mobile Header */}
        {isMobile && (
          <div className="flex items-center justify-between px-6 pb-6 border-b">
            <span className="text-lg font-semibold">Menu</span>
            <button onClick={closeDrawer}>
              <X className="cursor-pointer" />
            </button>
          </div>
        )}

        {/* Desktop Logo */}
        {!isMobile && (
          <Link to="/student/dashboard" className="flex justify-center mb-8">
            <img src="/login/assets/images/newImages/rubitt-lamp.png" alt="Logo" />
          </Link>
        )}

        {/* Main Links */}
        <nav
          className={`flex flex-col ${isMobile ? "mt-6 " : "items-center gap-2"}`}
        >
          {mainNavLinks.map((link) => {
            const Icon = link.icon;
            const active = isActiveRoute(link.to);

            return (
              <Link
                key={link.to}
                to={link.to}
                className={`transition-all ${isMobile
                  ? `flex items-center gap-4 px-4 py-4 border-b ${active ? "bg-[#9144E0]/10 text-[#6F2CCA]" : "text-gray-700"}`
                  : `p-3 rounded-lg ${active ? "bg-[#9144E0]/15 text-[#6F2CCA]" : "text-gray-600"}`
                  }`}
              >
                <Icon className="w-6 h-6" />
                {isMobile && <span className="text-lg">{link.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Bottom Links */}
        <nav
          className={`flex flex-col flex-shrink-0 ${isMobile ? "md:mt-auto border-t " : "items-center gap-2 mt-auto pt-4 border-t"}`}
        >
          {secondaryNavLinks.map((link) => {
            const Icon = link.icon;
            const active = isActiveRoute(link.to);

            return (
              <Link
                key={link.to}
                to={link.to}
                target={link.newTab ? "_main" : ""}
                className={`transition-all ${isMobile
                  ? `flex items-center gap-4 px-4 py-4 border-b ${active ? "bg-blue-50 text-blue-600" : "text-gray-700"
                  }`
                  : `p-3 rounded-lg ${active ? "bg-blue-100 text-blue-600" : "text-gray-600"
                  }`
                  }`}
              >
                {link.type === "profile" && profile?.profilePic ? (
                  <img
                    src={`${profile.profilePic}?t=${profile.updatedAt || Date.now()}`}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <Icon className="w-6 h-6" />
                )}
                {isMobile && <span className="text-lg">{link.label}</span>}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Hamburger */}
      {isMobile && !isDrawerOpen && (
        <button
          onClick={toggleDrawer}
          className="fixed top-6 right-2 z-30 p-3 bg-white rounded-xl shadow-lg cursor-pointer"
        >
          <Menu />
        </button>
      )}
    </>
  );
}
