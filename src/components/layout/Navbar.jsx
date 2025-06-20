import React, { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { auth, db } from "../../config/firebaseConfig";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faWhatsapp } from '@fortawesome/free-brands-svg-icons';

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const dropdownRef = useRef(null);

  // Fetch user and role
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setRole(null);
      if (firebaseUser) {
        // Try to find the user's role in Firestore
        const uid = firebaseUser.uid;
        // Admin First Level
        let ref = doc(db, "Users", "Info", "Admins", "Level", "FirstLevel", uid);
        let snap = await getDoc(ref);
        if (snap.exists()) return setRole("admin-first");
        // Admin Second Level
        ref = doc(db, "Users", "Info", "Admins", "Level", "SecondLevel", uid);
        snap = await getDoc(ref);
        if (snap.exists()) return setRole("admin-second");
        // Volunteer
        ref = doc(db, "Users", "Info", "Volunteers", uid);
        snap = await getDoc(ref);
        if (snap.exists()) return setRole("volunteer");
        // Requester
        ref = doc(db, "Users", "Info", "Requesters", uid);
        snap = await getDoc(ref);
        if (snap.exists()) return setRole("requester");
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
    setRole(null);
  };

  // Determine dashboard link by role
  let dashboardLink = "/";
  if (role === "admin-first" || role === "admin-second") dashboardLink = "/admin-dashboard";
  else if (role === "volunteer") dashboardLink = "/volunteer-dashboard";
  else if (role === "requester") dashboardLink = "/requester-dashboard";

  return (
    <nav className="bg-white/20 backdrop-blur-sm shadow-lg px-4 py-0 flex flex-row-reverse justify-between items-center sticky top-0 z-50">
      {/* "שיחות מהלב" on the left */}
      <Link to="/" className="">
        <img src="/images/logo.png" alt="שיחות מהלב Logo" className="h-16" />
      </Link>
      {/* All other links on the right */}
      <div className="space-x-4 rtl:space-x-reverse flex items-center">
        {!user ? (
          <>
            <Link to="/login" className="px-4 py-2 rounded-md border-2 border-orange-600 text-orange-700 hover:bg-orange-600 hover:text-white transition-all duration-200">התחברות</Link>
            <div className="relative inline-block" ref={dropdownRef}>
              <button 
                onClick={() => setIsOpen(!isOpen)}
                className="px-4 py-2 rounded-md border-2 border-orange-600 text-orange-700 hover:bg-orange-600 hover:text-white transition-all duration-200"
              >
                הרשמה
              </button>
              {isOpen && (
                <div className="absolute right-0 mt-2 bg-white shadow-lg rounded-md p-2 z-[9999] min-w-[150px]">
                  <Link 
                    to="/register-requester"
                    className="block px-4 py-2 text-orange-700 hover:bg-orange-600 hover:text-white transition-all duration-200 rounded-md whitespace-nowrap"
                    onClick={() => setIsOpen(false)}
                  >
                    הרשמה כפונה
                  </Link>
                  <div className="my-1 border-t border-orange-200/60"></div>
                  <Link 
                    to="/register-volunteer"
                    className="block px-4 py-2 text-orange-700 hover:bg-orange-600 hover:text-white transition-all duration-200 rounded-md whitespace-nowrap"
                    onClick={() => setIsOpen(false)}
                  >
                    הרשמה כמתנדב
                  </Link>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <Link to={dashboardLink} className="px-4 py-2 rounded-md border-2 border-orange-600 text-orange-700 hover:bg-orange-600 hover:text-white transition-all duration-200">
              איזור אישי
            </Link>
            <button
              onClick={handleLogout}
              className="px-4 py-2 rounded-md border-2 border-orange-600 text-orange-700 hover:bg-orange-600 hover:text-white transition-all duration-200"
            >
              התנתקות
            </button>
          </>
        )}
         <Link to="/events" className="px-4 py-2 rounded-md border-2 border-orange-600 text-orange-700 hover:bg-orange-600 hover:text-white transition-all duration-200">
          אירועים
        </Link>
        <Link to="/about" className="px-4 py-2 rounded-md border-2 border-orange-600 text-orange-700 hover:bg-orange-600 hover:text-white transition-all duration-200">אודות</Link>
        <a href="https://chat.whatsapp.com/L5kE8M2lzSj0Spr7gJKcV6" target="_blank" rel="noopener noreferrer" className="px-4 py-2 rounded-md border-2 border-green-600 text-green-700 hover:bg-green-600 hover:text-white transition-all duration-200"><FontAwesomeIcon icon={faWhatsapp} size="lg" /></a>
      </div>
    </nav>
  );
}