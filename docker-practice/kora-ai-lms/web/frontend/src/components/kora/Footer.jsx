import { Link } from 'lucide-react';
import React from 'react'

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
        <p className="mt-4 md:mt-0">&copy; 2025 kora learning Solutions - All Rights Reserved.</p>
      </div>
    </footer>
  );
};