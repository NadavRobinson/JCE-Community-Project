import React, { useRef, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import Layout from "../components/layout/Layout";
import HomePage from "./HomePage";
import EventsPage from "./EventsPage"; // Import the new EventsPage
import RegisterVolunteerPage from "../components/auth/RegisterVolunteerPage";
import RegisterRequesterPage from "../components/auth/RegisterRequesterPage";
import LoginPage from "../components/auth/LoginPage";
import RequesterDashboard from "../components/dashboards/RequesterDashboard";
import VolunteerDashboard from "../components/dashboards/VolunteerDashboard";
import AdminDashboard from "../components/dashboards/AdminDashboard";
import AboutPage from "./AboutPage";
import ProfilePage from "./ProfilePage";
import { auth, db } from "../config/firebaseConfig";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import CustomAlert from "../components/ui/CustomAlert";
import { AuthProvider } from '../contexts/AuthContext'; // Import AuthProvider

const IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minute in milliseconds
const WARNING_TIMEOUT = 10 * 1000; // 10 seconds before actual logout

function ProtectedRoute({ children, allowedRoles }) {
  const [user, setUser] = React.useState(null);
  const [role, setRole] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const navigate = useNavigate();
  const idleTimer = useRef(null);
  const warningTimer = useRef(null);
  const [showIdleWarning, setShowIdleWarning] = useState(false);

  const logoutUser = React.useCallback(() => {
    signOut(auth).then(() => {
      navigate("/login");
    }).catch((error) => {
      console.error("Error signing out due to inactivity:", error);
    });
  }, [navigate]);

  const startIdleTimer = React.useCallback(() => {
    if (idleTimer.current) {
      clearTimeout(idleTimer.current);
    }
    if (warningTimer.current) {
      clearTimeout(warningTimer.current);
    }
    setShowIdleWarning(false);

    if (user) {
      idleTimer.current = setTimeout(() => {
        setShowIdleWarning(true);
        warningTimer.current = setTimeout(() => {
          logoutUser();
        }, WARNING_TIMEOUT);
      }, IDLE_TIMEOUT - WARNING_TIMEOUT);
    }
  }, [user, logoutUser]);

  const resetIdleTimer = React.useCallback(() => {
    startIdleTimer();
  }, [startIdleTimer]);

  React.useEffect(() => {
    resetIdleTimer(); // Initialize or reset timer on mount

    const activityEvents = ["mousemove", "keydown", "scroll", "click"];
    activityEvents.forEach(event => {
      window.addEventListener(event, resetIdleTimer);
    });

    return () => {
      if (idleTimer.current) {
        clearTimeout(idleTimer.current);
      }
      if (warningTimer.current) {
        clearTimeout(warningTimer.current);
      }
      activityEvents.forEach(event => {
        window.removeEventListener(event, resetIdleTimer);
      });
    };
  }, [resetIdleTimer]);

  React.useEffect(() => {
    const checkAdminRole = async (uid) => {
      // Check FirstLevel admins
      const firstLevelRef = doc(db, "Users", "Info", "Admins", "Level", "FirstLevel", uid);
      let snapFirst = await getDoc(firstLevelRef);
      if (snapFirst.exists()) return "admin-first";

      // Check SecondLevel admins
      const secondLevelRef = doc(db, "Users", "Info", "Admins", "Level", "SecondLevel", uid);
      let snapSecond = await getDoc(secondLevelRef);
      if (snapSecond.exists()) return "admin-second";

      return null;
    };

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setUser(null);
        setRole(null);
        setLoading(false);
        return;
      }

      setUser(currentUser);
      resetIdleTimer(); // Reset timer on auth state change (login)
      
      // First check if user is an admin
      const adminRole = await checkAdminRole(currentUser.uid);
      if (adminRole) {
        setRole(adminRole);
        setLoading(false);
        return;
      }

      // Check other roles
      const roles = {
        volunteer: "Volunteers",
        requester: "Requesters"
      };

      for (const [roleType, collection] of Object.entries(roles)) {
        const docRef = doc(db, "Users", "Info", collection, currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setRole(roleType);
          break;
        }
      }

      setLoading(false);
    });
    return () => unsubscribe();
  }, [resetIdleTimer]);

  if (loading) return <LoadingSpinner />;
  
  // Modify the role check to handle admin levels
  const hasAllowedRole = allowedRoles.some(allowedRole => {
    if (allowedRole === "admin") {
      return role === "admin-first" || role === "admin-second";
    }
    return role === allowedRole;
  });
  
  if (!user || !hasAllowedRole) return <Navigate to="/login" />;

  return (
    <>
      {children}
      {showIdleWarning && (
        <CustomAlert
          message="תתנתק בקרוב עקב חוסר פעילות. לחץ/י בכל מקום כדי להישאר מחובר/ת."
          type="warning"
          onClose={() => setShowIdleWarning(false)} // This might not be needed as activity will hide it
        />
      )}
    </>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider> {/* Wrap your app with AuthProvider */}
        <Layout>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/events" element={<EventsPage />} /> {/* Add the new EventsPage route */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register-volunteer" element={<RegisterVolunteerPage />} />
            <Route path="/register-requester" element={<RegisterRequesterPage />} />
            <Route path="/about" element={<AboutPage />} />

            <Route
              path="/admin-dashboard"
              element={
                <ProtectedRoute allowedRoles={["admin-first", "admin-second"]}>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/requester-dashboard"
              element={
                <ProtectedRoute allowedRoles={["requester"]}>
                  <RequesterDashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/volunteer-dashboard"
              element={
                <ProtectedRoute allowedRoles={["volunteer"]}>
                  <VolunteerDashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/profile"
              element={
                <ProtectedRoute allowedRoles={["requester", "volunteer", "admin-first", "admin-second"]}>
                  <ProfilePage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </Layout>
      </AuthProvider>
    </Router>
  );
}

export default App;
