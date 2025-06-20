import { useState, useEffect } from "react";
import { db } from "../config/firebaseConfig";
import { collection, getDocs, Timestamp, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { EventCard } from "../components/EventCard/EventCard";
import { useAuth } from "../contexts/AuthContext"; // Hypothetical AuthContext
import CustomAlert from "../components/ui/CustomAlert";
import { Button } from "../components/ui/button"; // For potential future use like "Load More"

export default function EventsPage() {
    const [upcomingEvents, setUpcomingEvents] = useState([]);
    const [pastEvents, setPastEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [alertMessage, setAlertMessage] = useState(null);

    const { currentUser } = useAuth(); // Using hypothetical AuthContext

    useEffect(() => {
        const fetchEvents = async () => {
            try {
                const eventsCollection = collection(db, "Events");
                const eventSnapshot = await getDocs(eventsCollection);
                const now = new Date();
                const allEvents = eventSnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));

                const upcoming = [];
                const past = [];

                allEvents.forEach(event => {
                    const eventTime = event.scheduled_time instanceof Timestamp 
                                      ? event.scheduled_time.toDate() 
                                      : new Date(event.scheduled_time);
                    if (eventTime >= now) {
                        upcoming.push(event);
                    } else {
                        past.push(event);
                    }
                });

                // Sort events: upcoming soonest first, past most recent first
                upcoming.sort((a, b) => (a.scheduled_time.toDate()) - (b.scheduled_time.toDate()));
                past.sort((a, b) => (b.scheduled_time.toDate()) - (a.scheduled_time.toDate()));

                setUpcomingEvents(upcoming);
                setPastEvents(past);
            } catch (err) {
                console.error("Error fetching events:", err);
                setError(err.message);
                setAlertMessage({ message: `שגיאה בטעינת אירועים: ${err.message}`, type: "error" });
            } finally {
                setLoading(false);
            }
        };

        fetchEvents();
    }, []);

    const handleShowInterest = async (eventId, eventName) => {
        if (!currentUser) {
            setAlertMessage({ message: "עליך להתחבר כדי להביע עניין באירוע.", type: "error" });
            // Consider redirecting to login page: navigate('/login');
            return;
        }
        try {
            // Example: Store interest in a subcollection of the event or a separate collection
            // For simplicity, let's assume an 'eventInterest' collection
            // Document ID could be eventId_userId to ensure uniqueness if needed, or let Firestore auto-generate
            const interestRef = doc(db, "eventInterest", `${eventId}_${currentUser.uid}`);
            await setDoc(interestRef, {
                eventId: eventId,
                eventName: eventName,
                userId: currentUser.uid,
                userEmail: currentUser.email, // Store user email if available and relevant
                timestamp: serverTimestamp()
            });
            setAlertMessage({ message: `הבעת עניין באירוע "${eventName}" נרשמה בהצלחה!`, type: "success" });
        } catch (err) {
            console.error("Error showing interest:", err);
            setAlertMessage({ message: `שגיאה ברישום עניין: ${err.message}`, type: "error" });
        }
    };

    if (loading) return <div className="p-4 text-center text-xl text-orange-700">טוען אירועים...</div>;
    if (error && upcomingEvents.length === 0 && pastEvents.length === 0) return <div className="p-4 text-center text-red-600">שגיאה בטעינת אירועים: {error}</div>;

    return (
        <div className="container mx-auto p-4 sm:p-6 lg:p-8 max-w-screen-xl bg-white/80 backdrop-blur-sm rounded-lg shadow-xl my-8">
            <CustomAlert
                message={alertMessage?.message}
                type={alertMessage?.type}
                onClose={() => setAlertMessage(null)}
            />
            
            <h1 className="text-3xl sm:text-4xl font-bold text-orange-800 mb-8 text-center">לוח אירועים</h1>

            <section className="mb-12">
                <h2 className="text-2xl font-semibold text-orange-700 mb-6 border-b-2 border-orange-200 pb-2">אירועים קרובים</h2>
                {upcomingEvents.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {upcomingEvents.map(event => (
                            <EventCard 
                                key={event.id} 
                                event={event} 
                                currentUser={currentUser}
                                onShowInterest={handleShowInterest}
                                isUpcoming={true}
                            />
                        ))}
                    </div>
                ) : (
                    <p className="text-orange-600 text-center py-4">אין אירועים קרובים כרגע. נשמח לראותכם באירועים הבאים!</p>
                )}
            </section>

            <section>
                <h2 className="text-2xl font-semibold text-orange-700 mb-6 border-b-2 border-orange-200 pb-2">אירועי עבר</h2>
                {pastEvents.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {pastEvents.map(event => (
                            <EventCard key={event.id} event={event} isUpcoming={false} />
                        ))}
                    </div>
                ) : (
                    <p className="text-orange-600 text-center py-4">אין אירועי עבר להצגה.</p>
                )}
            </section>
        </div>
    );
}
