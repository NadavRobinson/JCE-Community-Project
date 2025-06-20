import React, { createContext, useContext, useState, useEffect } from 'react';
// import { auth } from '../config/firebaseConfig'; // Import your Firebase auth instance

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  useEffect(() => {
    // Replace this with your actual Firebase auth listener
    // const unsubscribe = auth.onAuthStateChanged(user => {
    //   setCurrentUser(user);
    //   setLoadingAuth(false);
    // });
    // return unsubscribe;

    // --- Mock user for demonstration ---
    // To test with a logged-in user, uncomment the line below:
    // setCurrentUser({ uid: "mockUserId123", email: "test@example.com", displayName: "Mock User" });
    // To test as a logged-out user, keep the line below:
    setCurrentUser(null);
    setLoadingAuth(false);
    // --- End Mock User ---
  }, []);

  const value = {
    currentUser,
    loadingAuth,
  };

  return <AuthContext.Provider value={value}>{!loadingAuth && children}</AuthContext.Provider>;
}
