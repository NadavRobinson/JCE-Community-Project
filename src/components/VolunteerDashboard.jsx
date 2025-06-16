// VolunteerDashboard.jsx
import React, { useEffect, useRef, useState } from "react";
import { User, Calendar, Clock, MessageCircle, Plus, X } from "lucide-react";
import { auth, db } from "../firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  addDoc,
  getDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { Button } from "./ui/button";
import LoadingSpinner from "./LoadingSpinner";
import DashboardLayout from "./dashboard/DashboardLayout";
import DashboardSection from "./dashboard/DashboardSection";
import SessionCard from "./dashboard/SessionCard";
import SessionsModal from "./dashboard/SessionsModal";

/* ────────────────────────── helpers ────────────────────────── */

// one-shot fetch of a requester's public profile
const fetchRequester = async (uid) => {
  if (!uid) {
    console.warn("fetchRequester called with invalid UID. Returning null.");
    return null;
  }
  const snap = await getDoc(
    doc(db, "Users", "Info", "Requesters", uid)
  );
  return snap.exists() ? { id: uid, ...snap.data() } : null;
};

/* ────────────────────────── main component ────────────────────────── */

export default function VolunteerDashboard() {
  /* -------- auth gate -------- */
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser]               = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthChecked(true);
      if (!u) window.location.replace("/login");
    });
    return unsub;
  }, []);

  /* -------- UI state -------- */
  const [loading, setLoading]         = useState(true);
  const [volProfile, setVolProfile]   = useState({});
  const [personal, setPersonal]       = useState(true);
  const [direct, setDirect]           = useState([]);
  const [pool, setPool]               = useState([]);
  const [matches, setMatches]         = useState([]);
  const [adminApprovalRequests, setAdminApprovalRequests] = useState([]);
  const [activeMatchId, setActiveMatchId] = useState(null);
  const [messages, setMessages]       = useState([]);
  const [newMsg, setNewMsg]           = useState("");
  const [userData, setUserData]        = useState(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState(null);

  /* listener refs */
  const unsubDirect = useRef(null);
  const unsubPool   = useRef(null);
  const unsubMatch  = useRef(null);
  const unsubAdminApproval = useRef(null);
  const unsubChat   = useRef(null);

  /* -------- bootstrap volunteer profile -------- */
  useEffect(() => {
    if (!authChecked || !user) return;

    const volRef = doc(db, "Users", "Info", "Volunteers", user.uid);

    const unsubVol = onSnapshot(
      volRef,
      async (snap) => {
        if (!snap.exists()) {
          // first login → create skeleton profile
          await setDoc(volRef, {
            approved: false,
            personal: true,
            createdAt: serverTimestamp(),
          });
          return;                 // wait for next snapshot
        }
        const data = snap.data();
        setVolProfile(data);
        setPersonal(data.personal ?? true);
        setUserData(data);
        setLoading(false);
      },
      (err) => {
        console.error("Volunteer doc error:", err);
        setLoading(false);
      }
    );

    return () => unsubVol();
  }, [authChecked, user]);

  /* -------- attach / detach pool listeners -------- */
  useEffect(() => {
    if (loading || !user) return;

    // ---- active matches (always) ----
    unsubMatch.current?.();
    unsubMatch.current = onSnapshot(
      query(
        collection(db, "Matches"),
        where("volunteerId", "==", user.uid),
        where("status",      "==", "active")
      ),
      async (snap) => {
        const arr = [];
        for (const d of snap.docs) {
          const m  = d.data();
          const rq = await fetchRequester(m.requesterId);
          arr.push({ id: d.id, ...m, requester: rq });
        }
        setMatches(arr);
      }
    );

    // ---- personal-only sections ----
    if (personal) {
      // direct Requests
      unsubDirect.current = onSnapshot(
        query(
          collection(db, "Requests"),
          where("volunteerId", "==", user.uid),
          where("status",      "==", "waiting_for_first_approval")
        ),
        async (snap) => {
          const arr = [];
          for (const d of snap.docs) {
            const rqData = d.data();
            const rqUser = await fetchRequester(rqData.requesterId);
            if (rqUser && rqUser.personal === false) {
              arr.push({ id: d.id, ...rqData, requester: rqUser });
            }
          }
          setDirect(arr);
        }
      );

      // Requests waiting for admin approval (new section)
      unsubAdminApproval.current = onSnapshot(
        query(
          collection(db, "Requests"),
          where("volunteerId", "==", user.uid),
          where("status",      "==", "waiting_for_admin_approval")
        ),
        async (snap) => {
          const arr = [];
          for (const d of snap.docs) {
            const rqData = d.data();
            const rqUser = await fetchRequester(rqData.requesterId);
            // Assuming these requests also come from requesters with personal: false, or this filter is not needed here
            if (rqUser) { // No personal filter needed here, as these are assigned requests
              arr.push({ id: d.id, ...rqData, requester: rqUser });
            }
          }
          setAdminApprovalRequests(arr);
        }
      );

      // open pool
      unsubPool.current = onSnapshot(
        query(
          collection(db, "Requests"),
          where("volunteerId", "==", null),
          where("status",      "==", "waiting_for_first_approval")
        ),        async (snap) => {
          console.log("Pool snapshot docs:", snap.docs.map(d => ({ id: d.id, ...d.data() })));
          const arr = [];
          for (const d of snap.docs) {
            const rqData = d.data();
            console.log("Processing request:", { id: d.id, ...rqData });
            const rqUser = await fetchRequester(rqData.requesterId);
            console.log("Fetched requester:", rqUser);
            if (rqUser && rqUser.personal === false) {
              arr.push({ id: d.id, ...rqData, requester: rqUser });
              console.log("Added to pool:", { id: d.id, ...rqData, requester: rqUser });
            } else {
              console.log("Skipped request because:", !rqUser ? "no requester found" : "requester.personal is true");
            }
          }
          console.log("Final pool array:", arr);
          setPool(arr);
        }
      );
    } else {
      unsubDirect.current?.(); unsubDirect.current = null; setDirect([]);
      unsubPool.current?.();   unsubPool.current   = null; setPool([]);
      unsubAdminApproval.current?.(); unsubAdminApproval.current = null; setAdminApprovalRequests([]); // Clear on personal mode off
    }

    return () => {
      unsubMatch.current?.();
      unsubDirect.current?.();
      unsubPool.current?.();
      unsubAdminApproval.current?.(); // Unsubscribe new listener
    };
  }, [personal, loading, user]);

  /* -------- handlers -------- */
  const flipPersonal = async () => {
    if (!user) return;
    const newVal = !personal;
    setPersonal(newVal); // optimistic
    await setDoc(
      doc(db, "Users", "Info", "Volunteers", user.uid),
      { personal: newVal },
      { merge: true }
    );
  };

  const handleRequestAction = async (req, action) => {
    const ref = doc(db, "Requests", req.id);
    if (action === "accept") {
      await updateDoc(ref, { status: "waiting_for_admin_approval" });
    } else if (action === "decline") {
      await updateDoc(ref, { status: "declined" });
    } else if (action === "take") {
      await updateDoc(ref, {
        volunteerId: user.uid,
        initiatedBy: user.uid,
        status:      "waiting_for_admin_approval",
      });
    } else if (action === "withdraw") {
      await updateDoc(ref, {
        volunteerId: null,
        status:      "waiting_for_first_approval",
      });
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
    setMessages([]); // Clear messages when closing chat
  };

  const sendMessage = async () => {
    if (!newMsg.trim() || !activeMatchId) return;
    await addDoc(
      collection(db, "conversations", activeMatchId, "messages"),
      {
        text:      newMsg.trim(),
        senderId:  user.uid,
        timestamp: serverTimestamp(),
      }
    );
    setNewMsg("");
  };

  const openScheduleModal = (match) => {
    setSelectedMatch(match);
    setShowScheduleModal(true);
  };

  const closeScheduleModal = () => {
    setSelectedMatch(null);
    setShowScheduleModal(false);
  };
  const handleScheduleSession = async (sessionData) => {
    try {
      await addDoc(collection(db, "Sessions"), {
        ...sessionData,
        status: "scheduled",
        createdAt: serverTimestamp(),
      });
      return true;
    } catch (error) {
      console.error("Error scheduling session:", error);
      return false;
    }
  };

  /* -------- render -------- */
  if (!authChecked || loading) {
    return <LoadingSpinner />;
  }

  // Prepare header content
  const headerContent = (
    <div className="flex items-center gap-4">
      <h1 className="text-2xl font-bold text-orange-800">
        שלום {userData?.fullName?.split(' ')[0] || ''} 👋
      </h1>
      <Button
        variant="outline"
        onClick={() => window.location.href = '/profile'}
      >
        הפרופיל שלי
      </Button>
      <div className="flex-1" />
      <div className="flex items-center gap-2">
        <span className="text-sm text-orange-700">בחירה עצמית</span>
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
        <span className="text-sm text-orange-700">שיוך ע״י מנהל</span>
      </div>
    </div>
  );

  // Prepare chat panel if active
  const chatPanel = activeMatchId ? (
    <ChatPanel
      messages={messages}
      newMsg={newMsg}
      setNewMsg={setNewMsg}
      onSend={sendMessage}
      chatPartnerName={matches.find(m => m.id === activeMatchId)?.requester?.fullName || 'שיחה'}
    />
  ) : null;

  return (
    <DashboardLayout
      header={headerContent}
      sideContent={chatPanel}
    >
      {/* Personal Mode Sections */}
      {personal && (
        <>
          <DashboardSection 
            title="בקשות ישירות" 
            empty="אין בקשות ישירות"
          >
            {direct.map((r) => (
              <RequestCard
                key={r.id}
                req={r}
                variant="direct"
                onAction={handleRequestAction}
              />
            ))}
          </DashboardSection>

          <DashboardSection 
            title="דפדוף בפונים פתוחים" 
            empty="אין פונים זמינים"
          >
            {pool.map((r) => (
              <RequestCard
                key={r.id}
                req={r}
                variant="pool"
                onAction={handleRequestAction}
              />
            ))}
          </DashboardSection>
        </>
      )}      {/* Admin Approval and Active Matches Sections */}
      <div className="flex flex-col gap-6">
        {/* Admin Approval Section */}
        <DashboardSection 
          title="בקשות ממתינות לאישור מנהל" 
          empty="אין בקשות הממתינות לאישור"
          fullWidth={true}
        >
          {adminApprovalRequests.map((r) => (
            <RequestCard
              key={r.id}
              req={r}
              variant="admin_approval"
              onAction={handleRequestAction}
            />
          ))}
        </DashboardSection>

        {/* Active Matches Section */}
        <DashboardSection 
          title="שיבוצים פעילים" 
          empty="אין שיבוצים פעילים"
          fullWidth={true}
        >
          {matches.map((m) => (
            <MatchCard
              key={m.id}
              match={m}
              onOpenChat={() => openChat(m.id)}
              onCloseChat={closeChat}
              onScheduleSession={() => openScheduleModal(m)}
              activeMatchId={activeMatchId}
            />
          ))}
        </DashboardSection>
      </div>

      {/* Schedule Session Modal */}
      {showScheduleModal && selectedMatch && (
        <SessionSchedulerModal
          match={selectedMatch}
          onClose={closeScheduleModal}
          onSchedule={handleScheduleSession}
        />
      )}
    </DashboardLayout>
  );
}

/* ────────────────────────── presentational helpers ───────────────────────── */

const Section = ({ title, empty, children }) => (
  <>
    <h2 className="text-xl font-semibold text-orange-800 mb-2">{title}</h2>
    {React.Children.count(children) === 0 ? (
      <Empty text={empty} />
    ) : (
      <div className="space-y-4">{children}</div>
    )}
  </>
);

const Empty = ({ text }) => (
  <p className="bg-orange-100 border border-orange-100 rounded-lg py-4 px-6 text-orange-700">
    {text}
  </p>
);

function RequestCard({ req, variant, onAction }) {
  const { requester } = req;

  // Helper to format array or string values
  const formatList = (value) => {
    if (!value) return "—";
    if (Array.isArray(value)) {
      return value.filter(v => v !== "אחר").join(", ");
    }
    return value;
  };

  // Determine actions based on variant
  const getActions = () => {
    switch (variant) {
      case "direct":
        return [
          {
            label: "אשר",
            onClick: () => onAction(req, "accept"),
            variant: "default"
          },
          {
            label: "דחה",
            onClick: () => onAction(req, "decline"),
            variant: "outline"
          }
        ];
      case "admin_approval":
        return [
          {
            label: "בטל בקשה",
            onClick: () => onAction(req, "withdraw"),
            variant: "destructive"
          }
        ];
      default: // pool
        return [
          {
            label: "קח פונה זה",
            onClick: () => onAction(req, "take"),
            variant: "default"
          }
        ];
    }
  };

  return (
    <SessionCard
      userInfo={{
        name: requester?.fullName || "פונה ללא שם",
        subtitle: `גיל: ${requester?.age ?? "—"} • מגדר: ${requester?.gender ?? "—"}`
      }}
      title="סיבת הפנייה"
      notes={requester?.reason}
      className="bg-gradient-to-r from-orange-50 to-amber-50"
      actions={getActions()}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
        <div className="bg-white/60 rounded-lg p-3 border border-orange-100">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-4 h-4 text-orange-600" />
            <h4 className="font-semibold text-orange-800 text-sm">תדירות</h4>
          </div>
          <p className="text-orange-700 text-sm">
            {formatList(requester?.frequency)}
          </p>
        </div>

        <div className="bg-white/60 rounded-lg p-3 border border-orange-100">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-orange-600" />
            <h4 className="font-semibold text-orange-800 text-sm">זמנים מועדפים</h4>
          </div>
          <p className="text-orange-700 text-sm">
            {formatList(requester?.preferredTimes)}
          </p>
        </div>

        {requester?.chatPref && (
          <div className="bg-white/60 rounded-lg p-3 border border-orange-100 md:col-span-2">
            <div className="flex items-center gap-2 mb-2">
              <MessageCircle className="w-4 h-4 text-orange-600" />
              <h4 className="font-semibold text-orange-800 text-sm">העדפת שיחה</h4>
            </div>
            <p className="text-orange-700 text-sm">
              {formatList(requester?.chatPref)}
            </p>
          </div>
        )}
      </div>
    </SessionCard>
  );
}

function MatchCard({ match, onOpenChat, onCloseChat, onScheduleSession, activeMatchId }) {
  const { requester } = match;
  const isChatOpen = activeMatchId === match.id;
  const [sessions, setSessions] = useState([]);
  const [sessionToComplete, setSessionToComplete] = useState(null);
  const [activeModal, setActiveModal] = useState(null); // 'upcoming', 'past', or 'completed'

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

  // Split sessions into categories
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
  // Common actions for the match header
  const matchActions = [
    {
      label: isChatOpen ? "סגור שיחה" : "💬 פתח שיחה",
      onClick: isChatOpen ? onCloseChat : onOpenChat
    },
    {
      label: (
        <span className="flex items-center gap-1">
          <Plus className="w-4 h-4" />
          קבע מפגש
        </span>
      ),
      onClick: onScheduleSession,
      variant: "outline"
    }
  ];  // Session summary buttons
  const sessionButtons = [
    {
      label: `מפגשים מתוכננים (${upcomingSessions.length})`,
      onClick: () => setActiveModal('upcoming'),
      variant: "outline"
    },
    {
      label: `ממתינים לסיכום (${pastSessions.length})`,
      onClick: () => setActiveModal('past'),
      variant: "outline"
    },
    {
      label: `מפגשים שהושלמו (${completedSessions.length})`,
      onClick: () => setActiveModal('completed'),
      variant: "outline"
    }
  ];

  return (
    <div className="space-y-4">
      {/* Match Header Card */}
      <SessionCard
        userInfo={{
          name: requester?.fullName || "פונה ללא שם",
          subtitle: ""
        }}
        actions={[...matchActions, ...sessionButtons]}
        className="bg-white"
      />

      {/* Session List Modals */}
      {activeModal === 'upcoming' && (
        <SessionsModal
          title="מפגשים מתוכננים"
          sessions={upcomingSessions}
          type="upcoming"
          formatSessionTime={formatSessionTime}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal === 'past' && (
        <SessionsModal
          title="מפגשים שהסתיימו וממתינים לסיכום"
          sessions={pastSessions}
          type="past"
          formatSessionTime={formatSessionTime}
          onClose={() => setActiveModal(null)}
          onSessionAction={setSessionToComplete}
          actionLabel="סמן כהושלם והוסף סיכום"
        />
      )}

      {activeModal === 'completed' && (
        <SessionsModal
          title="מפגשים שהושלמו"
          sessions={completedSessions}
          type="completed"
          formatSessionTime={formatSessionTime}
          onClose={() => setActiveModal(null)}
        />
      )}

      {/* Completion Modal */}
      {sessionToComplete && (
        <SessionCompletionModal
          session={sessionToComplete}
          onClose={() => setSessionToComplete(null)}
          onSubmit={() => setSessionToComplete(null)}
        />
      )}
    </div>
  );
}

function ChatPanel({ messages, newMsg, setNewMsg, onSend, chatPartnerName }) {
  const bottomRef = useRef(null);

  // auto-scroll on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="mt-8 border-t border-orange-200 pt-4">
      <h2 className="text-xl font-bold mb-3 text-orange-800">שיחה עם {chatPartnerName}</h2>

      <div className="h-64 overflow-y-scroll bg-orange-100 border border-orange-100 rounded-lg p-3 mb-3">
        {messages.map((m) => (
          <div
            key={m.id}
            className={
              m.senderId === auth.currentUser.uid ? "text-right" : "text-left"
            }
          >
            <span
              className={`inline-block rounded-lg px-3 py-1 my-1 max-w-[80%] ${
                m.senderId === auth.currentUser.uid
                  ? "bg-orange-600 text-white"
                  : "bg-white border border-orange-100"
              }`}
            >
              {m.text}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 border border-orange-200 rounded-md px-3 py-2 focus:ring-orange-400 focus:border-orange-400 outline-none"
          placeholder="כתוב הודעה..."
          value={newMsg}
          onChange={(e) => setNewMsg(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSend()}
        />
        <Button onClick={onSend}>שלח</Button>
      </div>
  </div>
);
}

function SessionCompletionModal({ session, onClose, onSubmit }) {
  const [summary, setSummary] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Fix: Use "Sessions" (capital S) to match your collection name
      await updateDoc(doc(db, "Sessions", session.id), {
        status: "completed",
        sessionSummary: summary,
        completedAt: serverTimestamp()
      });
      
      console.log("Session marked as completed:", session.id);
      onSubmit?.();
      onClose();
    } catch (error) {
      console.error("Error completing session:", error);
      setError("אירעה שגיאה בעדכון המפגש. נא לנסות שוב.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white p-4 rounded-lg border border-orange-200 max-w-md w-full">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-orange-800">סיום מפגש</h3>
          <button 
            onClick={onClose}
            className="text-orange-400 hover:text-orange-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-4 p-3 bg-orange-50 rounded-lg">
          <p className="text-sm text-orange-700">
            <strong>מפגש:</strong> {new Date(session.scheduledTime).toLocaleString('he-IL', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </p>
          <p className="text-sm text-orange-700">
            <strong>משך:</strong> {session.durationMinutes} דקות
          </p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-2 rounded-md mb-4">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-orange-700 mb-1">
              <MessageCircle className="inline-block w-4 h-4 ml-1" />
              סיכום המפגש (לא חובה)
            </label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-orange-200 py-2 px-3 focus:outline-none focus:ring-2 focus:ring-orange-400"
              placeholder="תאר בקצרה את מה שנעשה במפגש..."
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="submit"
              disabled={isSubmitting}
              className={isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}
            >
              {isSubmitting ? 'מעדכן...' : 'סמן כהושלם'}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              ביטול
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SessionSchedulerModal({ match, onClose, onSchedule }) {
  const [scheduledTime, setScheduledTime] = useState("");
  const [duration, setDuration] = useState(60);
  const [location, setLocation] = useState("video");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!scheduledTime) {
      setError("נא לבחור זמן למפגש");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const success = await onSchedule({
      matchId: match.id,
      volunteerId: match.volunteerId,
      requesterId: match.requesterId,
      scheduledTime: new Date(scheduledTime),
      durationMinutes: duration,
      location,
      notes
    });

    if (success) {
      alert("המפגש נקבע בהצלחה!");
      onClose();
    } else {
      setError("אירעה שגיאה בקביעת המפגש. נא לנסות שוב.");
    }
    setIsSubmitting(false);
  };

  const durationOptions = [
    { value: 30, label: "30 דקות" },
    { value: 45, label: "45 דקות" },
    { value: 60, label: "שעה" },
    { value: 90, label: "שעה וחצי" },
  ];

  const locationOptions = [
    { value: "video", label: "שיחת וידאו" },
    { value: "phone", label: "שיחת טלפון" },
    { value: "in_person", label: "פגישה פיזית" },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg border-2 border-orange-300 shadow-lg w-full max-w-md">
        <div className="flex justify-between items-center p-4 border-b border-orange-200">
          <h3 className="text-xl font-semibold text-orange-800">קביעת מפגש חדש</h3>
          <button 
            onClick={onClose}
            className="text-orange-400 hover:text-orange-600 rounded-lg p-1 hover:bg-orange-50 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-md">
              {error}
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-orange-700 mb-1">
              <Calendar className="inline-block w-4 h-4 ml-1" />
              תאריך ושעה
            </label>
            <input
              type="datetime-local"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              className="w-full rounded-md border border-orange-200 py-2 px-3 focus:outline-none focus:ring-2 focus:ring-orange-400"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-orange-700 mb-1">
              <Clock className="inline-block w-4 h-4 ml-1" />
              משך המפגש
            </label>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full rounded-md border border-orange-200 py-2 px-3 focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              {durationOptions.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-orange-700 mb-1">
              <MessageCircle className="inline-block w-4 h-4 ml-1" />
              אופן המפגש
            </label>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full rounded-md border border-orange-200 py-2 px-3 focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              {locationOptions.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-orange-700 mb-1">
              <MessageCircle className="inline-block w-4 h-4 ml-1" />
              הערות למפגש
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-orange-200 py-2 px-3 focus:outline-none focus:ring-2 focus:ring-orange-400"
              placeholder="הערות או נושאים לדיון..."
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="submit"
              disabled={isSubmitting}
              className={isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}
            >
              {isSubmitting ? 'קובע מפגש...' : 'קבע מפגש'}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              ביטול
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}