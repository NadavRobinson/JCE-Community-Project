import React, { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { auth, db } from "../../config/firebaseConfig";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faWhatsapp } from '@fortawesome/free-brands-svg-icons';

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false); // For desktop "הרשמה" dropdown
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); // For mobile hamburger menu
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const dropdownRef = useRef(null);
  const mobileMenuRef = useRef(null);

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
      // Close mobile menu if clicking outside of it, but not if clicking the hamburger button itself
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target) && !event.target.closest('#hamburger-button')) {
        setIsMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
    setRole(null);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };


  // Determine dashboard link by role
  let dashboardLink = "/";
  if (role === "admin-first" || role === "admin-second") dashboardLink = "/admin-dashboard";
  else if (role === "volunteer") dashboardLink = "/volunteer-dashboard";
  else if (role === "requester") dashboardLink = "/requester-dashboard";

  return (
    <nav className="bg-white/20 backdrop-blur-sm shadow-lg px-4 py-0 sticky top-0 z-50">
      {/* For RTL, flex-row-reverse makes the "end" the left side for justify-between */}
      <div className="container mx-auto flex items-center justify-between flex-wrap md:flex-nowrap py-2 md:py-0 md:flex-row-reverse">
        {/* Logo - will be on the visual left in RTL due to flex-row-reverse on parent */}
        <Link to="/" className="py-1 md:mr-auto"> {/* md:mr-auto pushes it to the far left on desktop */}
          <img src="/images/logo.png" alt="שיחות מהלב Logo" className="h-16" />
        </Link>

        <button // Hamburger button
          id="hamburger-button"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="md:hidden p-2 rounded-md text-orange-700 hover:bg-orange-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-orange-500"
          aria-label="Open main menu"
          aria-expanded={isMobileMenuOpen}
          aria-controls="mobile-menu-links" // Points to the ID of the menu it controls
        >
          <svg className="h-6 w-6" stroke="currentColor" fill="none" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={isMobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
          </svg>
        </button>

        <div // Links container
          id="mobile-menu-links" // ID for aria-controls
          ref={mobileMenuRef}
          className={`
            w-full md:w-auto  /* Desktop: auto width. Mobile: full width */
            ${isMobileMenuOpen ? 'flex flex-col items-stretch text-center mt-2 space-y-2' : 'hidden'} /* Mobile open styles */
            md:flex md:flex-row md:items-center md:mt-0 md:space-y-0 md:space-x-4 /* Desktop general styles - rtl:space-x-reverse is not needed here if parent is flex-row-reverse */
          `}
        >
          {!user ? (
            <>
              <Link to="/login" onClick={closeMobileMenu} className="px-4 py-3 md:py-2 rounded-md border-2 border-orange-600 text-orange-700 hover:bg-orange-600 hover:text-white transition-all duration-200">התחברות</Link>
              <div className="relative inline-block w-full md:w-auto" ref={dropdownRef}>
                <button 
                  onClick={() => setIsOpen(!isOpen)}
                  className="w-full md:w-auto px-4 py-3 md:py-2 rounded-md border-2 border-orange-600 text-orange-700 hover:bg-orange-600 hover:text-white transition-all duration-200"
                >
                  הרשמה
                </button>
                {isOpen && ( // This is the desktop dropdown for "הרשמה"
                  <div className="absolute right-0 mt-2 bg-white shadow-lg rounded-md p-2 z-[9999] min-w-[150px] text-right">
                    <Link 
                      to="/register-requester"
                      className="block px-4 py-2 text-orange-700 hover:bg-orange-600 hover:text-white transition-all duration-200 rounded-md whitespace-nowrap"
                      onClick={() => { setIsOpen(false); closeMobileMenu(); }}
                    >
                      הרשמה כפונה
                    </Link>
                    <div className="my-1 border-t border-orange-200/60"></div>
                    <Link 
                      to="/register-volunteer"
                      className="block px-4 py-2 text-orange-700 hover:bg-orange-600 hover:text-white transition-all duration-200 rounded-md whitespace-nowrap"
                      onClick={() => { setIsOpen(false); closeMobileMenu(); }}
                    >
                      הרשמה כמתנדב
                    </Link>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link to={dashboardLink} onClick={closeMobileMenu} className="px-4 py-3 md:py-2 rounded-md border-2 border-orange-600 text-orange-700 hover:bg-orange-600 hover:text-white transition-all duration-200">
                איזור אישי
              </Link>
              <button
                onClick={() => { handleLogout(); closeMobileMenu(); }}
                className="w-full md:w-auto px-4 py-3 md:py-2 rounded-md border-2 border-orange-600 text-orange-700 hover:bg-orange-600 hover:text-white transition-all duration-200"
              >
                התנתקות
              </button>
            </>
          )}
           <Link to="/events" onClick={closeMobileMenu} className="px-4 py-3 md:py-2 rounded-md border-2 border-orange-600 text-orange-700 hover:bg-orange-600 hover:text-white transition-all duration-200">
            אירועים
          </Link>
          <Link to="/about" onClick={closeMobileMenu} className="px-4 py-3 md:py-2 rounded-md border-2 border-orange-600 text-orange-700 hover:bg-orange-600 hover:text-white transition-all duration-200">אודות</Link>
          <a href="https://chat.whatsapp.com/L5kE8M2lzSj0Spr7gJKcV6" onClick={closeMobileMenu} target="_blank" rel="noopener noreferrer" className="px-4 py-3 md:py-2 rounded-md border-2 border-green-600 text-green-700 hover:bg-green-600 hover:text-white transition-all duration-200 flex items-center justify-center"><FontAwesomeIcon icon={faWhatsapp} size="lg" className="mr-2 md:mr-0"/> <span className="md:hidden ml-2">WhatsApp</span></a>
        </div>
      </div>
    </nav>
  );
}
