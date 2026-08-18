import React from "react";
import { FaUserCircle } from "react-icons/fa";
import { Link } from "react-router-dom";
import { IoMdSettings } from "react-icons/io";
import { MdDashboard, MdRequestPage } from "react-icons/md";
import { FaUser } from "react-icons/fa";
import Dashboardlayout from "../../components/AdminDashboardLayout";
import AdminDashboardlayout from "../../components/AdminDashboardLayout";

const Navbar = () => {
  return (
    <nav className="bg-white text-black p-4 fixed w-full top-0 left-0 z-10 shadow-md">
      <div className="container mx-auto flex justify-between items-center">
        {/* Logo */}
        <div className="text-2xl font-bold flex items-center space-x-2">
          <img src="https://via.placeholder.com/50" alt="Logo" className="h-10" />
          <span className="text-blue-500">Rubitt learning</span>
        </div>

        {/* Navigation Links */}
        <ul className="flex space-x-6 text-lg">
          <li><Link to="/" className="hover:text-blue-500">Home</Link></li>
          <li><Link to="/funding" className="hover:text-blue-500">Funding</Link></li>
          <li><Link to="/project" className="hover:text-blue-500">Projects</Link></li>
          <li><Link to="/contact" className="hover:text-blue-500">Contact Us</Link></li>
        </ul>

        {/* Profile */}
        <div className="flex items-center space-x-2">
          <FaUserCircle className="text-3xl" />
          <span>Daniel</span>
        </div>
      </div>
    </nav>
  );
};

const Banner = () => {
  return (
    <div className="bg-blue-500 text-white text-center py-6 mt-16 w-full">
      <h1 className="text-3xl font-bold">Borrower Account</h1>
    </div>
  );
};

const Sidebar = () => {
  return (
    <div className="w-64 bg-gray-100 h-screen text-black p-4 fixed top-28 left-0">
      <ul className="space-y-3">
        <li className="py-2 px-4 rounded bg-blue-100 flex items-center space-x-2">
          <MdDashboard className="text-xl" />
          <Link to="/dashboard">Dashboard</Link>
        </li>
        <li className="py-2 px-4 rounded hover:bg-gray-300 flex items-center space-x-2">
          <MdRequestPage className="text-xl" />
          <Link to="/requests">Requests</Link>
        </li>
        <li className="py-2 px-4 rounded hover:bg-gray-300 flex items-center space-x-2">
          <FaUser className="text-xl" />
          <Link to="/myaccount">My Account</Link>
        </li>
        <li className="py-2 px-4 rounded hover:bg-gray-300 flex items-center space-x-2">
          <IoMdSettings className="text-xl" />
          <Link to="/settings">Settings</Link>
        </li>
      </ul>
    </div>
  );
};

export const Footer = () => {
  return (
    <footer className="bg-gray-900 text-white text-center p-6 w-full">
      <div className="container mx-auto flex flex-col md:flex-row justify-between items-center">
        <ul className="flex space-x-6">
          <li><Link to="/investors" className="hover:underline">For Investors</Link></li>
          <li><Link to="/borrowers" className="hover:underline">For Borrowers</Link></li>
          <li><Link to="/funding" className="hover:underline">Fundings</Link></li>
          <li><Link to="/privacy" className="hover:underline">Privacy Policy</Link></li>
          <li><Link to="/contact" className="hover:underline">Contact Us</Link></li>
        </ul>
        <p className="mt-4 md:mt-0">&copy; 2026 Rubitt learning Solutions - All Rights Reserved.</p>
      </div>
    </footer>
  );
};

const CustomerViewPage = () => {
  return (
    <AdminDashboardlayout>

      <div className="flex flex-col min-h-screen">
        {/* Full-width Navbar */}
        <Navbar />

        {/* Full-width Banner */}
        <Banner />

        {/* Main Content (Sidebar + Content Section) */}
        <div className="flex flex-1">
          {/* Sidebar */}
          {/* <Sidebar /> */}

          {/* Content Section */}
          <main className="flex-1 p-8 bg-gray-100 ml-64">
            <div className="bg-white shadow-md p-6 rounded-lg">
              <h2 className="text-2xl font-bold mb-4">Hi Daniel,</h2>
              <p className="text-lg">
                Your response has been received. Our team is currently reviewing it, and within 2 working days, we will let you know whether it has been approved or not.
              </p>
              <p className="mt-4">
                If you have any further questions, feel free to reach out to our support team!
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-6 mt-6">
              <Link to="/rejected" className="text-blue-500 underline">If Rejected</Link>
              <Link to="/accepted" className="text-blue-500 underline">If Accepted</Link>
              <Link to="/" className="text-blue-500 underline">Go Back</Link>
            </div>
          </main>
        </div>

        {/* Full-width Footer */}
        {/* <Footer /> */}
      </div>
    </AdminDashboardlayout>

  );
};

export default CustomerViewPage;
