import React, { useEffect, useRef, useState } from "react";
import { auth, db } from "../../config/firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  addDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { Button } from "../ui/button";
import EmergencyButton from "../EmergencyButton/EmergencyButton";
import LoadingSpinner from "../ui/LoadingSpinner";
import { Card } from "../ui/card";
import { X, User as UserIcon, Calendar, Clock, MessageCircle, Plus, Sparkles, Info, CheckCircle, AlertTriangle, Users } from "lucide-react"; // Added Info, CheckCircle, AlertTriangle, Users
import ChatPanel from "../ui/ChatPanel";
import CustomAlert from "../ui/CustomAlert";
// import { User } from "lucide-react"; // Redundant import
import LifeAdvice from "./LifeAdvice"; // Corrected import casing

/* ────────────────────────── helpers ────────────────────────── */

// one-shot fetch of a volunteer's public profile
const fetchVolunteer = async (uid) => {
  if (!uid) {
    console.warn("[DEBUG-FETCH] fetchVolunteer called with invalid UID. Returning null.");
    return null;
  }
  const snap = await getDoc(
    doc(db, "Users", "Info", "Volunteers", uid)
  );
  return snap.exists() ? { id: uid, ...snap.data() } : null;
};

// Calculate compatibility score between requester and volunteer preferences
const calculateCompatibilityScore = (requesterProfile, volunteer) => {
  let score = 0;
  let maxScore = 0;

  // Helper to extract time period from volunteer time slots
  const extractTimePeriod = (timeSlot) => {
    // Extract just the period name before the parentheses
    const match = timeSlot.match(/^([^(]+)/);
    return match ? match[1].trim() : timeSlot;
  };

  // Check frequency and days compatibility
  if (requesterProfile.frequency && (volunteer.availableDays || volunteer.frequency)) {
    maxScore += 3;

    const requesterFreqs = Array.isArray(requesterProfile.frequency)
      ? requesterProfile.frequency
      : [requesterProfile.frequency];

    // Filter out "אחר" from requester frequencies
    const validFreqs = requesterFreqs.filter(f => f !== "אחר");


    if (validFreqs.length > 0) {
      const volunteerDaysCount = volunteer.availableDays?.length || 0;

      // Score based on whether volunteer has enough available days
      validFreqs.forEach(freq => {
        if (freq === "פעם בשבוע" && volunteerDaysCount >= 1) score += 1.5;
        if (freq === "פעמיים בשבוע" && volunteerDaysCount >= 2) score += 1.5;
      });
    }
  }

  // Check preferred times compatibility
  if (requesterProfile.preferredTimes && volunteer.availableHours) {
    maxScore += 4;

    const requesterTimes = Array.isArray(requesterProfile.preferredTimes)
      ? requesterProfile.preferredTimes
      : [requesterProfile.preferredTimes];

    // Filter out "אחר" from requester times
    const validTimes = requesterTimes.filter(t => t !== "אחר");

    // Extract just the time period names from volunteer hours
    const volunteerPeriods = volunteer.availableHours.map(extractTimePeriod);


    // Count matching time periods
    const matchingPeriods = validTimes.filter(rt =>
      volunteerPeriods.some(vp => vp === rt)
    );

    // Award points based on number of matching periods
    // 1 match = 2 points, 2+ matches = 4 points
    if (matchingPeriods.length >= 2) {
      score += 4;
    } else if (matchingPeriods.length === 1) {
      score += 2;
    }
  }

  const finalScore = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  return finalScore;
};

// Helper function to generate Google Calendar link (moved here or should be imported)
const generateGoogleCalendarLink = (session, partnerName) => {
  const startTime = session.scheduledTime;
  const endTime = new Date(startTime.getTime() + session.durationMinutes * 60000);

  const formatDateForGoogle = (date) => {
    return date.toISOString().replace(/-|:|\.\d+/g, '');
  };

  const eventName = `פגישה עם ${partnerName || 'השותף/ה שלך'}`;
  const details = `מפגש תמיכה מתוכנן. מיקום: ${session.location}. ${session.notes ? `הערות: ${session.notes}` : ''}`;
  
  return `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(eventName)}&dates=${formatDateForGoogle(startTime)}/${formatDateForGoogle(endTime)}&details=${encodeURIComponent(details)}`;
};


// Sort volunteers by compatibility
const sortVolunteersByCompatibility = (volunteers, requesterProfile) => {
  return volunteers.map(volunteer => ({
    ...volunteer,
    compatibilityScore: calculateCompatibilityScore(requesterProfile, volunteer)
  })).sort((a, b) => b.compatibilityScore - a.compatibilityScore);
};

/* ────────────────────────── main component ────────────────────────── */

export default function RequesterDashboard() {
  /* -------- auth gate -------- */
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthChecked(true);
      if (!u) window.location.replace("/login");
    });
    return unsub;
  }, []);

  /* -------- UI state -------- */
  const [loading, setLoading] = useState(true);
  const [requestProfile, setRequestProfile] = useState({});
  const [personal, setPersonal] = useState(true); // true = פנייה ישירה למתנדב, false = ללא העדפה
  const [availableVolunteers, setAvailableVolunteers] = useState([]);
  const [sortedVolunteers, setSortedVolunteers] = useState([]);
  const [adminApprovalRequests, setAdminApprovalRequests] = useState([]);
  // eslint-disable-next-line no-unused-vars
  const [matches, setMatches] = useState([]);
  const [activeMatch, setActiveMatch] = useState(null);
  const [activeMatchId, setActiveMatchId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState("");
  const [userData, setUserData] = useState(null);
  const [requestLoading, setRequestLoading] = useState(false);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [activeTab, setActiveTab] = useState("available");
  const [alertMessage, setAlertMessage] = useState(null);
  const [requesterFormConfig, setRequesterFormConfig] = useState({
    hideNoteField: false, // Initialize with default structure
    customFields: []
  }); // For LifeAdvice
  const [userStatus, setUserStatus] = useState({ text: "טוען סטטוס...", icon: <LoadingSpinner size="sm" />, color: "text-gray-600" });


  // Set the appropriate first tab when switching modes
  useEffect(() => {
    // If AI advice tab is active, don't change it when 'personal' toggles
    if (activeTab === "lifeAdvice") return;

    if (personal) {
      setActiveTab("available");
    } else {
      // If not personal, default to 'current' match tab
      setActiveTab("current");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personal]); // Only re-run when 'personal' changes

  /* listener refs */
  const unsubVolunteers = useRef(null);
  const unsubAdminApproval = useRef(null);
  const unsubMatch = useRef(null);
  const unsubChat = useRef(null);
  const unsubPendingRequests = useRef(null);
  /* -------- bootstrap requester profile -------- */
  useEffect(() => {
    if (!authChecked || !user) return;

    const reqRef = doc(db, "Users", "Info", "Requesters", user.uid);

    const unsubReq = onSnapshot(
      reqRef,
      async (snap) => {
        const data = snap.data();
        setRequestProfile(data);
        setPersonal(data.personal === undefined ? true : data.personal);
        setUserData(data); // Keep this if other parts of the component use it directly
        setLoading(false);
      },
      (err) => {
        console.error("[DEBUG ERROR] Requester doc error:", err);
        setLoading(false);
      }
    );

    return () => unsubReq();
  }, [authChecked, user]);
  /* -------- fetch declined volunteers list from request -------- */
  const [declinedVolunteers, setDeclinedVolunteers] = useState([]);

  // Fetch the request document to get the declinedVolunteers list
  useEffect(() => {
    if (!user) return;

    const fetchDeclinedVolunteers = async () => {
      try {
        // Query for the requester's request
        const requestsRef = collection(db, "Requests");
        const q = query(
          requestsRef,
          where("requesterId", "==", user.uid),
          where("status", "==", "waiting_for_first_approval")
        );

        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
          // Get the first request document (there should only be one per requester)
          const requestDoc = snapshot.docs[0];
          const requestData = requestDoc.data();

          // Extract declinedVolunteers array or use empty array if it doesn't exist
          const declined = requestData.declinedVolunteers || [];
          setDeclinedVolunteers(declined);
        } else {
          setDeclinedVolunteers([]);
        }
      } catch (error) {
        console.error("Error fetching declined volunteers:", error);
      }
    };

    fetchDeclinedVolunteers();
  }, [user, pendingRequests]); // Re-fetch when pendingRequests changes

  // Fetch requester form configuration for LifeAdvice
  useEffect(() => {
    const fetchRequesterConfig = async () => {
      try {
        const configDocRef = doc(db, "admin_form_configs", "requester_config");
        const docSnap = await getDoc(configDocRef);
        if (docSnap.exists()) {
          const configData = docSnap.data() || {};
          // Ensure hideNoteField is also captured if it exists
          setRequesterFormConfig({
            hideNoteField: configData.hideNoteField || false,
            customFields: Array.isArray(configData.customFields) ? configData.customFields : [],
          });
        }
      } catch (error) {
        console.error("Error fetching requester admin config for LifeAdvice:", error);
      }
    };
    fetchRequesterConfig();
  }, [authChecked, user]);

  /* -------- sort volunteers when data changes -------- */
  useEffect(() => {
    if (availableVolunteers.length > 0 && requestProfile && Object.keys(requestProfile).length > 0) { // Ensure requestProfile is populated
      // Filter out any volunteers that are in the declinedVolunteers list
      const filteredVolunteers = availableVolunteers.filter(
        volunteer => !declinedVolunteers.includes(volunteer.id)
      );

      const sorted = sortVolunteersByCompatibility(filteredVolunteers, requestProfile);
      setSortedVolunteers(sorted);
    } else {
      setSortedVolunteers([]);
    }
  }, [availableVolunteers, requestProfile, declinedVolunteers]);

  /* -------- attach / detach listeners based on mode -------- */
  useEffect(() => {
    if (loading || !user) return;


    // ---- active matches (always) ----
    unsubMatch.current?.();
    unsubMatch.current = onSnapshot(
      query(
        collection(db, "Matches"),
        where("requesterId", "==", user.uid),
        where("status", "==", "active")
      ),
      async (snap) => {
        const arr = [];
        for (const d of snap.docs) {
          const m = d.data();
          const vol = await fetchVolunteer(m.volunteerId);
          if (vol) {
            arr.push({ id: d.id, ...m, volunteer: vol });
          } else {
            console.warn("[DEBUG] Failed to fetch volunteer for match:", m);
          }
        }
        setActiveMatch(arr.length > 0 ? arr[0] : null); // Keep existing activeMatch behavior
        setMatches(arr);
      }
    );

    // Clear any existing listeners
    unsubVolunteers.current?.();
    unsubAdminApproval.current?.();

    if (personal) {
      // available volunteers
      unsubVolunteers.current = onSnapshot(
        query(
          collection(db, "Users", "Info", "Volunteers"),
          where("approved", "==", "true"),
          where("isAvailable", "==", true),
          where("personal", "==", true) // Only show volunteers in personal mode
        ),
        (snap) => {
          setAvailableVolunteers(
            snap.docs.map(d => ({ id: d.id, ...d.data() }))
          );
        }
      );

      // show requests waiting for admin approval
      unsubAdminApproval.current = onSnapshot(
        query(
          collection(db, "Requests"),
          where("requesterId", "==", user.uid),
          where("status", "==", "waiting_for_admin_approval")
        ),
        async (snap) => {
          const arr = [];
          for (const d of snap.docs) {
            const rqData = d.data();
            const volunteer = await fetchVolunteer(rqData.volunteerId);
            if (volunteer) {
              arr.push({ id: d.id, ...rqData, volunteer: volunteer });
            }
          }
          setAdminApprovalRequests(arr);
        }
      );
    }
    else {
      // When not in personal mode, clear the states
      setAvailableVolunteers([]);
      setAdminApprovalRequests([]);
    }

    return () => {
      unsubMatch.current?.();
      unsubVolunteers.current?.();
      unsubAdminApproval.current?.();
    };
  }, [personal, loading, user]);

  /* -------- listen for pending requests -------- */
  useEffect(() => {
    if (!user) return;
    unsubPendingRequests.current = onSnapshot(
      query(
        collection(db, "Requests"),
        where("requesterId", "==", user.uid),
        where("status", "in", ["waiting_for_first_approval", "waiting_for_admin_approval"])
      ),
      async (snap) => {

        // Look for the waiting_for_first_approval request to get declinedVolunteers
        const firstApprovalRequest = snap.docs.find(d => d.data().status === "waiting_for_first_approval");
        if (firstApprovalRequest) {
          const data = firstApprovalRequest.data();
          // Update declined volunteers list
          setDeclinedVolunteers(data.declinedVolunteers || []);
        }

        const requests = await Promise.all(snap.docs.map(async (d) => {
          const data = d.data();
          if (data.volunteerId) {
            const volunteer = await fetchVolunteer(data.volunteerId);
            return { id: d.id, ...data, volunteer };
          }
          return { id: d.id, ...data };
        }));

        // Filter out requests that don't have a volunteerId
        const requestsWithVolunteer = requests.filter(req => req.volunteerId);

        setPendingRequests(requestsWithVolunteer);
      }
    );

    return () => unsubPendingRequests.current?.();
  }, [user]);

  // Update user status display based on activeMatch and pendingRequests
  useEffect(() => {
    if (activeMatch) {
      setUserStatus({ text: "נמצא שיבוץ עם מתנדב/ת", icon: <CheckCircle className="w-5 h-5 text-green-500" />, color: "text-green-700" });
    } else if (pendingRequests.some(req => req.status === "waiting_for_admin_approval")) {
      setUserStatus({ text: "הבקשה נשלחה וממתינה לאישור מנהל", icon: <Clock className="w-5 h-5 text-blue-500" />, color: "text-blue-700" });
    } else if (pendingRequests.some(req => req.status === "waiting_for_first_approval")) {
      setUserStatus({ text: "הבקשה נשלחה וממתינה לאישור המתנדב/ת", icon: <Clock className="w-5 h-5 text-yellow-500" />, color: "text-yellow-700" });
    } else if (personal && sortedVolunteers.length > 0) {
      setUserStatus({ text: "ניתן לפנות למתנדבים זמינים", icon: <Users className="w-5 h-5 text-orange-500" />, color: "text-orange-700" });
    } else if (!personal) {
      setUserStatus({ text: "ממתין להתאמה על ידי המערכת", icon: <Info className="w-5 h-5 text-purple-500" />, color: "text-purple-700" });
    }
    else {
      setUserStatus({ text: "אין מתנדבים זמינים כרגע במצב פנייה ישירה", icon: <AlertTriangle className="w-5 h-5 text-red-500" />, color: "text-red-600" });
    }
  }, [activeMatch, pendingRequests, personal, sortedVolunteers]);


  /* -------- handlers -------- */
  const flipPersonal = async () => {
    if (!user) return;
    const newVal = !personal;
    setPersonal(newVal); // optimistic
    await setDoc(
      doc(db, "Users", "Info", "Requesters", user.uid),
      { personal: newVal },
      { merge: true }
    );
  };
  const requestVolunteer = async (volunteerId) => {
    try {
      setRequestLoading(true);

      // First verify the volunteer is still available
      const volunteerDoc = await getDoc(doc(db, "Users", "Info", "Volunteers", volunteerId));
      if (!volunteerDoc.exists()) {
        console.warn("[DEBUG] Volunteer not found:", volunteerId);
        setAlertMessage({message: "המתנדב/ת לא נמצא/ה במערכת", type: "error"});
        return;
      }

      const volunteerData = volunteerDoc.data();

      if (!volunteerData.isAvailable || volunteerData.approved !== "true") { // Ensure approved is string "true"
        console.warn("[DEBUG] Volunteer is unavailable or not approved");
        setAlertMessage({message: "המתנדב/ת אינו/ה זמין/ה כעת", type: "error"});
        return;
      }

      // Find the requester's existing request document
      const requestsRef = collection(db, "Requests");
      const q = query(
        requestsRef,
        where("requesterId", "==", user.uid),
        where("status", "==", "waiting_for_first_approval")
      );

      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const requestDoc = snapshot.docs[0];
        const requestId = requestDoc.id;

        // Determine the appropriate status based on volunteer's personal mode setting
        const newStatus = volunteerData.personal === false ?
        "waiting_for_admin_approval":
        "waiting_for_first_approval";

        // Update the existing request with the selected volunteer
        await updateDoc(doc(db, "Requests", requestId), {
          volunteerId: volunteerId,
          initiatedBy: user.uid,
          status: newStatus,
          updatedAt: serverTimestamp(),
        });

        // Update the local state to reflect this change
        const updatedPendingRequests = [...pendingRequests];
        const existingReqIndex = updatedPendingRequests.findIndex(req => req.id === requestId);

        if (existingReqIndex >= 0) {
          // Update existing request
          updatedPendingRequests[existingReqIndex] = {
            ...updatedPendingRequests[existingReqIndex],
            volunteerId,
            initiatedBy: user.uid,
            status: newStatus
          };
        } else {
          // Add as a new request to the pending list
          updatedPendingRequests.push({
            id: requestId,
            requesterId: user.uid,
            volunteerId,
            initiatedBy: user.uid,
            status: newStatus,
            volunteer: volunteerData
          });
        }

        setPendingRequests(updatedPendingRequests);
      } else {
        // This case should ideally not happen if a request is always created on registration.
        // If it can, you might need to create a new request document here.
        console.error("No 'waiting_for_first_approval' request found for requester to update.");
        setAlertMessage({message: "שגיאה: לא נמצאה בקשה פתוחה לעדכון.", type: "error"});
      }

      setAlertMessage({message: "הבקשה נשלחה בהצלחה וממתינה לאישור", type: "success"});
    } catch (error) {
      console.error("Error requesting volunteer:", error);
      setAlertMessage({message: "אירעה שגיאה בשליחת הבקשה. אנא נסה שוב", type: "error"});
    } finally {
      setRequestLoading(false);
    }
  };
  const cancelRequest = async (requestId) => {
    try {
      setRequestLoading(true);

      // Find the request to extract current data before updating
      const requestDoc = await getDoc(doc(db, "Requests", requestId));
      if (!requestDoc.exists()) {
        setAlertMessage({message: "הבקשה לא נמצאה במערכת", type: "error"});
        return;
      }


      // const volunteerId = requestDoc.data().volunteerId;

      // Update the request to remove the volunteerId and initiatedBy fields
      await updateDoc(doc(db, "Requests", requestId), {
        volunteerId: null,
        initiatedBy: null,
        updatedAt: serverTimestamp(),
      });

      setAlertMessage({message: "הבקשה בוטלה בהצלחה", type: "success"});
    } catch (error) {
      console.error("Error canceling request:", error);
      setAlertMessage({message: "אירעה שגיאה בביטול הבקשה. אנא נסה שוב", type: "error"});
    } finally {
      setRequestLoading(false);
    }
  };

  const openChat = (matchId) => {
    setActiveMatchId(matchId);
    unsubChat.current?.();
    unsubChat.current = onSnapshot(
      query(
        collection(db, "conversations", matchId, "messages"),
        orderBy("timestamp")
      ),
      (snap) => setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
  };

  const closeChat = () => {
    setActiveMatchId(null);
    unsubChat.current?.();
    unsubChat.current = null;
    setMessages([]);
  };

  const sendMessage = async () => {
    if (!newMsg.trim() || !activeMatch) return;
    await addDoc(
      collection(db, "conversations", activeMatch.id, "messages"),
      {
        text: newMsg.trim(),
        senderId: user.uid,
        timestamp: serverTimestamp(),
      }
    );
    setNewMsg("");
  };

  /* -------- render -------- */
  if (!authChecked || loading || !requestProfile) { // Ensure requestProfile is also loaded
    return <LoadingSpinner />;
  }
  const renderTabContent = () => {
    switch (activeTab) {
      case "available":
        return personal ? (
          <div className="space-y-4">
            {activeMatch ? (
              <div className="bg-orange-100 border border-orange-200 rounded-lg p-4 text-orange-700 text-center">
                <p className="font-medium">יש לך כבר שיבוץ פעיל עם מתנדב/ת. אין אפשרות לפנות למתנדבים נוספים.</p>
              </div>
            ) : sortedVolunteers.length > 0 ? (
              sortedVolunteers.map((vol) => (
                <VolunteerCard
                  key={vol.id}
                  volunteer={vol}
                  onRequest={() => requestVolunteer(vol.id)}
                  isRecommended={vol.compatibilityScore >= 50}
                  compatibilityScore={vol.compatibilityScore}
                  requestLoading={requestLoading}
                  pendingRequests={pendingRequests}
                  cancelRequest={cancelRequest}
                />
              ))
            ) : (
              <Empty text="אין מתנדבים זמינים כרגע" />
            )}
          </div>
        ) : null;

      case "pending":
        return (
          <div className="space-y-4">
            {adminApprovalRequests.length > 0 ? (
              adminApprovalRequests.map((r) => (
                <AdminApprovalCard
                  key={r.id}
                  request={r}
                />
              ))
            ) : (
              <Empty text="אין בקשות הממתינות לאישור" />
            )}
          </div>
        );
      case "current":
        return (
          <div className="space-y-4">
            {activeMatch ? (
              <MatchCard
                match={activeMatch}
                onOpenChat={openChat}
                onCloseChat={closeChat}
                activeMatchId={activeMatchId}
              />
            ) : (
              <Empty text="אין שיבוץ נוכחי" />
            )}
          </div>
        );
      case "lifeAdvice": // New case for LifeAdvice tab
        // Ensure both requestProfile and requesterFormConfig are loaded before rendering
        if (!requestProfile || Object.keys(requestProfile).length === 0 || !requesterFormConfig) {
           return <LoadingSpinner />;
        }
        // Pass requestProfile as userData and the fetched config
        return requestProfile ? <LifeAdvice userData={requestProfile} requesterFormConfig={requesterFormConfig} /> : <LoadingSpinner />;

      default:
        return null;
    }
  };

  return (
    <div className="p-4 md:p-6"> {/* Adjusted padding for mobile */}
      {/* header + toggle */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-orange-800 flex-grow">
          שלום {requestProfile?.fullName?.split(' ')[0] || ''} 👋
        </h1>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 w-full sm:w-auto">
          <Button
            variant="outline"
            className="mr-auto sm:mr-2 w-full sm:w-auto text-sm py-2" // Adjusted for mobile
            onClick={() => window.location.href = '/profile'}
          >
            הפרופיל שלי
          </Button>
          <div className="flex items-center gap-2 mt-2 sm:mt-0">
            <span className="text-xs sm:text-sm text-orange-700 whitespace-nowrap">פנייה ישירה</span>
            <button
              onClick={flipPersonal}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors outline-none ring-2 ring-orange-400 ring-offset-2 ${
                personal ? 'bg-orange-600 border-orange-400' : 'bg-gray-200 border-orange-400'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform border-2 border-orange-400 ${
                  personal ? '-translate-x-1' : '-translate-x-6'
                }`}
              />
            </button>
            <span className="text-xs sm:text-sm text-orange-700 whitespace-nowrap">ללא העדפה</span>
          </div>
        </div>
      </div>

      {/* User Status Display */}
      <div className={`flex items-center gap-2 p-3 mb-6 rounded-lg border ${userStatus.color.replace('text-', 'border-').replace('-700', '-300').replace('-600', '-300').replace('-500', '-200')} bg-${userStatus.color.replace('text-', '').replace('-700', '-50').replace('-600', '-50').replace('-500', '-50')}`}>
        {userStatus.icon}
        <p className={`font-medium text-sm ${userStatus.color}`}>{userStatus.text}</p>
      </div>

      {/* Tabs */}
      <Card className="mb-6">
        <div className="flex flex-wrap border-b border-gray-200"> {/* Added flex-wrap */}
          {personal && (
            <>
            <button
                onClick={() => setActiveTab("available")}
                className={`
                  flex-grow sm:flex-1 p-3 text-center font-medium text-xs sm:text-sm focus:outline-none whitespace-nowrap
                  ${activeTab === "available"
                    ? 'border-b-2 border-orange-500 text-orange-600'
                    : 'text-gray-500 hover:text-gray-700'
                  }
                `}
              >
                מתנדבים זמינים{!activeMatch && ` (${sortedVolunteers.length})`}
              </button>
              <button
                onClick={() => setActiveTab("pending")}
                className={`
                  flex-grow sm:flex-1 p-3 text-center font-medium text-xs sm:text-sm focus:outline-none whitespace-nowrap
                  ${activeTab === "pending"
                    ? 'border-b-2 border-orange-500 text-orange-600'
                    : 'text-gray-500 hover:text-gray-700'
                  }
                `}
              >
                בקשות לאישור מנהל ({adminApprovalRequests.length})
              </button>
            </>
          )}
          <button
            onClick={() => setActiveTab("current")}
            className={`
              flex-grow sm:flex-1 p-3 text-center font-medium text-xs sm:text-sm focus:outline-none whitespace-nowrap
              ${activeTab === "current"
                ? 'border-b-2 border-orange-500 text-orange-600'
                : 'text-gray-500 hover:text-gray-700'
              }
            `}
          >
            השיבוץ הנוכחי ({activeMatch ? 1 : 0})
          </button>
          <button
            onClick={() => setActiveTab("lifeAdvice")}
            className={`
              flex-grow sm:flex-1 p-3 text-center font-medium text-xs sm:text-sm focus:outline-none flex items-center justify-center gap-1 sm:gap-2 whitespace-nowrap
              ${activeTab === "lifeAdvice"
                ? 'bg-gradient-to-r from-orange-400 via-red-400 to-purple-500 text-white shadow-inner'
                : 'text-gray-500 hover:text-gray-700 hover:bg-orange-50/50'
              }
              transition-all duration-200 ease-in-out
            `}
          >
            <Sparkles className={`w-3 h-3 sm:w-4 sm:h-4 ${activeTab === "lifeAdvice" ? 'text-white' : 'text-purple-500'}`} />
            <span className="truncate">ייעוץ מהלב AI</span>
          </button>
        </div>
      </Card>

      {/* Tab Content */}
      <div className="mt-6">
        {renderTabContent()}
      </div>

      {/* Emergency Button */}
      <EmergencyButton activeMatch={activeMatch} />

      {/* Chat Panel - Now shown as a floating window */}
      <ChatPanel
        isOpen={!!unsubChat.current && !!activeMatch}
        onClose={closeChat}
        messages={messages}
        newMsg={newMsg}
        setNewMsg={setNewMsg}
        onSend={sendMessage}
        chatPartnerName={activeMatch?.volunteer?.fullName || 'שיחה'}
      />

      <CustomAlert
        message={alertMessage?.message}
        onClose={() => setAlertMessage(null)}
        type={alertMessage?.type}
      />
    </div>
  );
}

/* ────────────────────────── presentational helpers ───────────────────────── */

const Empty = ({ text }) => (
  <p className="bg-orange-100 border border-orange-100 rounded-lg py-4 px-6 text-orange-700">
    {text}
  </p>
);

function VolunteerCard({ volunteer, onRequest, isRecommended, compatibilityScore, requestLoading, pendingRequests, cancelRequest }) {
  const formatList = (list) => {
    if (!list) return "—";
    if (Array.isArray(list)) {
      return list.join(", ");
    }
    return list;
  };

  const [volunteerAdminConfig, setVolunteerAdminConfig] = useState(null);

  useEffect(() => {
    const fetchVolunteerConfig = async () => {
      // console.log(`[VolunteerCard] Attempting to fetch volunteer_config for volunteerId: ${volunteer.id}`);
      try {
        const configDocRef = doc(db, "admin_form_configs", "volunteer_config");
        const configSnap = await getDoc(configDocRef);
        if (configSnap.exists()) {
          const configData = configSnap.data();
          // console.log("[VolunteerCard] Successfully fetched volunteer_config data:", JSON.stringify(configData, null, 2));
          setVolunteerAdminConfig({
            ...configData,
            customFields: Array.isArray(configData.customFields) ? configData.customFields : []
          });
        } else {
          // console.warn("[VolunteerCard] Volunteer admin config document not found at admin_form_configs/volunteer_config.");
          setVolunteerAdminConfig({ customFields: [] });
        }
      } catch (error) {
        console.error("[VolunteerCard] Error fetching volunteer admin config:", error);
        setVolunteerAdminConfig({ customFields: [] });
      }
    };
    if (volunteer?.id) { // Only fetch if volunteer.id is available
      fetchVolunteerConfig();
    }
  }, [volunteer?.id]); // Depend on volunteer.id

  // Check if there's a pending request for this volunteer
  const pendingRequest = pendingRequests.find(req => req.volunteerId === volunteer.id);
  const isPending = !!pendingRequest;
  // const isWaitingForAdmin = pendingRequest?.status === "waiting_for_admin_approval"; // Commented out as it's not used
  // Check if there's any pending request to any volunteer (to hide buttons for other volunteers)
  const hasAnyPendingRequest = pendingRequests.length > 0;
  const showOtherVolunteers = !hasAnyPendingRequest || isPending;

  // Don't show the button if this is not the pending volunteer and there's another pending request
  const shouldShowButton = showOtherVolunteers || isPending;

  // Determine if there are any shareable custom fields to display
  let shareableCustomFields = [];
  if (volunteer && volunteerAdminConfig && Array.isArray(volunteerAdminConfig.customFields) && volunteerAdminConfig.customFields.length > 0) {
    Object.entries(volunteer).forEach(([key, value]) => {
      const fieldDef = volunteerAdminConfig.customFields.find(
        (f) => f.name === key && f.shareWithPartner === true
      );
      if (fieldDef) {
        let displayValue = value;
        if (Array.isArray(value)) {
          displayValue = value.join(", ");
        } else if (typeof value === 'boolean') {
          displayValue = value ? "כן" : "לא";
        } else if (value === null || value === undefined || value === '') {
          displayValue = "—";
        }
        shareableCustomFields.push({ key, label: fieldDef.label, value: String(displayValue) });
      }
    });
  }

  // console.log(`Volunteer ${volunteer.id}: isPending=${isPending}, hasAnyPending=${hasAnyPendingRequest}, shouldShow=${shouldShowButton}`);

  return (
    <div className="border border-orange-100 rounded-lg p-4 bg-orange-100">
      {isRecommended && (
        <div className="mb-2 flex items-center gap-2">
          <span className="text-green-600 text-sm font-medium bg-green-50 px-2 py-1 rounded-full border border-green-200">
            ⭐ מומלץ ({Math.round(compatibilityScore)}% התאמה)
          </span>
        </div>
      )}
        <p className="font-semibold text-lg mb-1 text-orange-800">
        {volunteer.fullName || "מתנדב/ת"}
      </p>

      <p className="text-sm mb-2 text-orange-700">
        תחום: {volunteer.profession ?? "—"}
      </p>

      <p className="text-sm mb-2 text-orange-700">
        ניסיון: {volunteer.experience ?? "—"}
      </p>

      {/* Show availability information */}
      {volunteer.availableHours && (
        <p className="text-sm mb-2 text-orange-700">
          שעות זמינות: {formatList(volunteer.availableHours)}
        </p>
      )}

      {volunteer.availableDays && (
        <p className="text-sm mb-2 text-orange-700">
          ימים זמינים: {formatList(volunteer.availableDays)}
        </p>
      )}

      {volunteer.frequency && (
        <p className="text-sm mb-3 text-orange-700">
          תדירות: {formatList(volunteer.frequency)}
        </p>
      )}

      {/* Shared Custom Fields from Volunteer */}
      {shareableCustomFields.length > 0 && (
        <div className="mt-4 pt-4 border-t border-orange-200">
          <h4 className="font-semibold text-orange-800 text-md mb-2">מידע נוסף מהמתנדב:</h4>
          <div className="space-y-1 text-sm">
            {/* {(() => {
              console.log("[VolunteerCard] START Rendering Shared Fields. Volunteer Data:", JSON.stringify(volunteer, null, 2));
              console.log("[VolunteerCard] Using Volunteer Admin Config:", JSON.stringify(volunteerAdminConfig, null, 2));
              console.log("[VolunteerCard] Shareable fields to render:", shareableCustomFields);
              return null;
            })()} */}
            {shareableCustomFields.map(field => (
              <p key={field.key} className="text-orange-700">
                <strong className="text-orange-800">{field.label}:</strong> {field.value}
              </p>
            ))}
          </div>
        </div>
      )}

      {shouldShowButton && (
        isPending ? (
          <Button
            onClick={() => cancelRequest(pendingRequest.id)}
            className={requestLoading ? 'opacity-50 cursor-not-allowed bg-red-600 hover:bg-red-700' : 'bg-red-600 hover:bg-red-700'}
            disabled={requestLoading}
          >
            {requestLoading ? 'מבטל בקשה...' : 'בטל בקשה'}
          </Button>
        ) : (
          <Button
            onClick={onRequest}
            className={requestLoading ? 'opacity-50 cursor-not-allowed' : ''}
            disabled={requestLoading}
          >
            {requestLoading ? 'שולח בקשה...' : 'פנה למתנדב/ת'}
          </Button>
        )
      )}
    </div>
  );
}

function AdminApprovalCard({ request }) {
  const { volunteer } = request;
  return (
    <div className="border border-orange-100 bg-orange-100 rounded-lg p-4">
      <p className="font-semibold text-orange-800 text-lg mb-1">
        {volunteer?.fullName || "מתנדב/ת"}
      </p>
      <p className="text-orange-700 text-sm mb-2">
        תחום: {volunteer?.profession ?? "—"}
      </p>
      <p className="text-orange-700 mb-3">
        ניסיון: {volunteer?.experience ?? "—"}
      </p>
      <p className="text-orange-600 text-sm font-medium">
        ממתין לאישור מנהל
      </p>
    </div>
  );
}

function MatchCard({ match, onOpenChat, onCloseChat, activeMatchId }) {
  const { volunteer } = match;
  const isChatOpen = activeMatchId === match.id;
  const [sessions, setSessions] = useState([]);
  const [showUpcomingSessionsModal, setShowUpcomingSessionsModal] = useState(false);
  const [showPastSessionsModal, setShowPastSessionsModal] = useState(false);
  const [showCompletedSessionsModal, setShowCompletedSessionsModal] = useState(false);
  const [volunteerAdminConfig, setVolunteerAdminConfig] = useState(null);

  useEffect(() => {
    const sessionsRef = collection(db, "Sessions");
    return onSnapshot(
      query(
        sessionsRef,
        where("matchId", "==", match.id),
        orderBy("scheduledTime", "asc")
      ),
      (snapshot) => {
        const sessionData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          scheduledTime: doc.data().scheduledTime?.toDate()
        }));
        setSessions(sessionData);
      }
    );
  }, [match.id]);

  // Fetch volunteer admin config when volunteer data is available
  useEffect(() => {
    const fetchVolunteerConfig = async () => {
      if (match?.volunteerId) {
        // console.log(`[MatchCard - RequesterDashboard] Attempting to fetch volunteer_config for volunteerId: ${match.volunteerId}`);
        try {
          const configDocRef = doc(db, "admin_form_configs", "volunteer_config");
          const configSnap = await getDoc(configDocRef);
          if (configSnap.exists()) {
            const configData = configSnap.data();
            // console.log("[MatchCard - RequesterDashboard] Successfully fetched volunteer_config data:", JSON.stringify(configData, null, 2));
            setVolunteerAdminConfig({
              ...configData,
              customFields: Array.isArray(configData.customFields) ? configData.customFields : []
            });
          } else {
            // console.warn("[MatchCard - RequesterDashboard] Volunteer admin config document not found at admin_form_configs/volunteer_config.");
            setVolunteerAdminConfig({ customFields: [] });
          }
        } catch (error) {
          console.error("[MatchCard - RequesterDashboard] Error fetching volunteer admin config:", error);
          setVolunteerAdminConfig({ customFields: [] });
        }
      } else {
        // console.log("[MatchCard - RequesterDashboard] No volunteerId in match, cannot fetch config.");
        setVolunteerAdminConfig({ customFields: [] });
      }
    };
    fetchVolunteerConfig();
  }, [match?.volunteerId]); // Depend on volunteerId


  // Split sessions into categories: upcoming, past, and completed
  const now = new Date();
  const { upcomingSessions, pastSessions, completedSessions } = sessions.reduce((acc, session) => {
    if (session.status === 'completed') {
      acc.completedSessions.push(session);
    } else if (session.scheduledTime > now) {
      acc.upcomingSessions.push(session);
    } else {
      acc.pastSessions.push(session);
    }
    return acc;
  }, { upcomingSessions: [], pastSessions: [], completedSessions: [] });

  // Get the count of past sessions
  const pastSessionsCount = pastSessions.length;

  // Determine if there are any shareable custom fields to display for the MatchCard
  let matchShareableCustomFields = [];
  if (volunteer && volunteerAdminConfig && Array.isArray(volunteerAdminConfig.customFields) && volunteerAdminConfig.customFields.length > 0) {
    Object.entries(volunteer).forEach(([key, value]) => {
      const fieldDef = volunteerAdminConfig.customFields.find(
        (f) => f.name === key && f.shareWithPartner === true
      );
      if (fieldDef) {
        let displayValue = value;
        if (Array.isArray(value)) {
          displayValue = value.join(", ");
        } else if (typeof value === 'boolean') {
          displayValue = value ? "כן" : "לא";
        } else if (value === null || value === undefined || value === '') {
          displayValue = "—";
        }
        matchShareableCustomFields.push({ key, label: fieldDef.label, value: String(displayValue) });
      }
    });
  }

  return (
    <div className="border border-orange-100 bg-orange-100 rounded-lg p-4">
    {/* Header Section */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-orange-200 rounded-full flex items-center justify-center">
            <UserIcon className="w-6 h-6 text-orange-600" />
          </div>
          <div>
            <h3 className="font-bold text-orange-900 text-xl mb-1">
              {volunteer?.fullName || "מתנדב/ת ללא שם"} {/* Changed to volunteer */}
            </h3>
            <div className="flex items-center gap-4 text-sm text-orange-700">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-orange-400 rounded-full"></span>
                גיל: {volunteer?.age ?? "—"} {/* Changed to volunteer */}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-orange-400 rounded-full"></span>
                מגדר: {volunteer?.gender ?? "—"} {/* Changed to volunteer */}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-orange-400 rounded-full"></span>
                טלפון: {volunteer?.phone ?? "—"} {/* Changed to volunteer */}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Shared Custom Fields from Volunteer */}
      {matchShareableCustomFields.length > 0 && (
        <div className="mt-4 pt-4 border-t border-orange-200">
          <h4 className="font-semibold text-orange-800 text-md mb-2">מידע נוסף מהמתנדב:</h4>
          <div className="space-y-1 text-sm">
            {/* {(() => {
              console.log("[MatchCard - RequesterDashboard] START Rendering Shared Fields. Volunteer Data:", JSON.stringify(volunteer, null, 2));
              console.log("[MatchCard - RequesterDashboard] Using Volunteer Admin Config:", JSON.stringify(volunteerAdminConfig, null, 2));
              console.log("[MatchCard - RequesterDashboard] Shareable fields to render:", matchShareableCustomFields);
              return null; // Or <></>
            })()} */}
            {matchShareableCustomFields.map(field => (
              <p key={field.key} className="text-orange-700">
                <strong className="text-orange-800">{field.label}:</strong> {field.value}
              </p>
            ))}
          </div>
        </div>
      )}


      {/* Chat and Sessions Buttons */}
      <div className="flex gap-2 flex-wrap">
        <Button onClick={isChatOpen ? onCloseChat : () => onOpenChat(match.id)}>
          {isChatOpen ? "סגור שיחה" : "💬 פתח שיחה"}
        </Button>
        {upcomingSessions.length > 0 && (
          <Button
            variant="outline"
            onClick={() => setShowUpcomingSessionsModal(true)}
            className="flex items-center gap-2"
          >
            מפגשים מתוכננים ({upcomingSessions.length})
        </Button>
        )}
        {pastSessionsCount > 0 && (
          <Button
            variant="outline"
            onClick={() => setShowPastSessionsModal(true)}
            className="flex items-center gap-2"
          >
            מפגשים שהסתיימו ({pastSessionsCount})
          </Button>
        )}
        {completedSessions.length > 0 && (
          <Button
            variant="outline"
            onClick={() => setShowCompletedSessionsModal(true)}
            className="flex items-center gap-2"
          >
            מפגשים שהושלמו ({completedSessions.length})
          </Button>
        )}
      </div>

      {/* Modals */}
      {showUpcomingSessionsModal && (
        <SessionModal
          title="מפגשים מתוכננים"
          sessions={upcomingSessions}
          onClose={() => setShowUpcomingSessionsModal(false)}
          partnerName={volunteer?.fullName}
        />
      )}
      {showPastSessionsModal && (
        <SessionModal
          title="מפגשים שהסתיימו"
          sessions={pastSessions}
          onClose={() => setShowPastSessionsModal(false)}
          readOnly={true}
          partnerName={volunteer?.fullName}
        />
      )}
      {showCompletedSessionsModal && (
        <SessionModal
          title="מפגשים שהושלמו"
          sessions={completedSessions}
          onClose={() => setShowCompletedSessionsModal(false)}
          readOnly={true}
          partnerName={volunteer?.fullName}
        />
      )}
    </div>
  );
}

function SessionModal({ title, sessions, onClose, readOnly = false, partnerName }) {
  const now = new Date();

  // Helper function to format session times in Hebrew
  const formatSessionTime = (date) => {
    if (!date) return "—";
    return new Date(date).toLocaleString('he-IL', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getSessionStatusColor = (session) => {
    if (session.status === 'completed') {
      return 'bg-green-50 border-green-100';
    }
    if (session.scheduledTime < now && session.status !== 'completed') { // Corrected logic
      return 'bg-orange-100 border-orange-200';
    }
    return 'bg-orange-50 border-orange-100';
  };

  const getLocationIcon = (location) => {
    switch (location) {
      case 'video':
        return '🎥';
      case 'phone':
        return '📱';
      case 'in_person':
        return '🤝';
      default:
        return '📅';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white p-4 rounded-lg border border-orange-200 max-w-md w-full">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-orange-800">{title}</h3>
          <button
            onClick={onClose}
            className="text-orange-400 hover:text-orange-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {sessions.length === 0 ? (
          <p className="text-center text-orange-500 py-4">
            אין מפגשים זמינים להצגה.
          </p>
        ) : (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
            {sessions.map(session => (
              <div
                key={session.id}
                className={`p-3 rounded-md text-sm transition-colors ${session.status === 'completed' ? 'bg-green-50 border-green-100' : 'bg-orange-50 border-orange-100'}`}
              >
                <div className="font-medium text-orange-800 flex items-center justify-between">
                  <span>{new Date(session.scheduledTime).toLocaleString('he-IL', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}</span>
                  {session.status === 'completed' && (
                    <span className="text-green-600 text-xs bg-green-100 px-2 py-1 rounded-full">
                      הושלם
                    </span>
                  )}
                </div>

                <div className="text-orange-600 mt-1">
                  {session.location === 'video' ? '🎥' : session.location === 'phone' ? '📱' : '🤝'}
                  {' • '}{session.durationMinutes} דקות
                </div>

                {session.notes && (
                  <div className="text-orange-500 mt-2 bg-white/50 p-2 rounded">
                    <strong>הערות:</strong> {session.notes}
                  </div>
                )}
                 {session.status === 'completed' && session.sessionSummary && (
                  <div className="mt-2 text-gray-600 bg-white/80 p-2 rounded border border-orange-100">
                    <strong>סיכום המפגש:</strong> {session.sessionSummary}
                  </div>
                )}
                {!readOnly && session.scheduledTime > now && (
                  <a
                    href={generateGoogleCalendarLink(session, partnerName)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-orange-100 hover:text-orange-900 h-9 px-4 py-2 border border-orange-200 bg-orange-50 text-orange-700"
                  >
                    🗓️ הוסף ליומן גוגל
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
