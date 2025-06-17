import Navbar from './Navbar';
import { EventSlider } from "../../components/EventSlider/EventSlider";
import { useLocation } from 'react-router-dom';

export default function Layout({ children },) {

    const location = useLocation();
    const showEventsPages = ['/requester-dashboard', '/volunteer-dashboard'];
    const shouldShowEvents = showEventsPages.includes(location.pathname);

    return (
        <div className="min-h-screen flex flex-col" style={{ background: 'radial-gradient(circle at 70% 10%, #ffd7bd 0%, #ffb488 50%, #f49b8c 100%)' }}>
            <Navbar />

            {/* Main Content */}
            <main className="container mx-auto px-4 py-4 items-center justify-center">
                {children}
            </main>

            { shouldShowEvents && (
                <EventSlider />
            )}

            <footer className="bg-orange-100/30 backdrop-blur-sm py-4 mt-auto">
                <div className="container mx-auto px-4 text-center text-orange-800">
                    <p className="text-sm opacity-60">© 2026 Talks from the Heart. All rights reserved.</p>
                </div>
            </footer>
        </div>
    );
}