import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../config/firebaseConfig';

const TIME_OPTIONS = [
  { label: 'ימים (שבוע אחרון)', value: 'days' },
  { label: 'שבועות (חודש אחרון)', value: 'weeks' },
  { label: 'חודשים (שנה אחרונה)', value: 'months' },
  { label: 'שנים (כל השנים)', value: 'years' },
];

const DATA_OPTIONS = [
  { label: 'התאמות', value: 'matches' },
  { label: 'שיחות', value: 'sessions' },
  { label: 'פונים', value: 'requesters' },
  { label: 'מתנדבים', value: 'volunteers' },
  { label: 'פונים ומתנדבים', value: 'users' },
  { label: 'אירועים', value: 'events' },
  { label: 'מתעניינים באירועים', value: 'interested' }, // New tab for interested users
];

function formatDate(date, type) {
  if (type === 'days') return date.toLocaleDateString('he-IL', { weekday: 'short', day: '2-digit', month: '2-digit' });
  if (type === 'weeks') {
    // Show the first day of the week (Sunday)
    const firstDay = new Date(date);
    const day = firstDay.getDay();
    // In Israel, week starts on Sunday (0)
    firstDay.setDate(firstDay.getDate() - day);
    return `${firstDay.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' })}`;
  }
  if (type === 'months') return date.toLocaleDateString('he-IL', { month: 'short', year: '2-digit' });
  if (type === 'years') return date.getFullYear().toString();
  return '';
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil((((d - yearStart) / 86400000) + 1)/7);
}

export default function UnifiedAnalyticsBarChart() {
  const [loading, setLoading] = useState(true);
  const [timeType, setTimeType] = useState('days');
  const [dataType, setDataType] = useState('matches');
  const [matches, setMatches] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [requesters, setRequesters] = useState([]);
  const [volunteers, setVolunteers] = useState([]);
  const [events, setEvents] = useState([]);
  const [chartData, setChartData] = useState([]);
  // Add state for time offset (in units of the selected timeType)
  const [timeOffset, setTimeOffset] = useState(0);

  // Fetch all data on mount
  useEffect(() => {
    async function fetchAll() {
      setLoading(true);

      // Matches
      const matchesSnap = await getDocs(collection(db, 'Matches'));
      const matchesData = matchesSnap.docs.map(doc => {
        const d = doc.data();
        return {
          ...d,
          startDate: d.startDate?.toDate ? d.startDate.toDate() : (d.startDate ? new Date(d.startDate) : null)
        };
      }).filter(m => m.startDate);

      // Sessions
      const sessionsSnap = await getDocs(collection(db, 'Sessions'));
      const sessionsData = sessionsSnap.docs.map(doc => {
        const d = doc.data();
        return {
          ...d,
          createdAt: d.createdAt?.toDate ? d.createdAt.toDate() : (d.createdAt ? new Date(d.createdAt) : null)
        };
      }).filter(s => s.createdAt);

      // Requesters
      const reqSnap = await getDocs(collection(db, 'Users', 'Info', 'Requesters'));
      const reqData = reqSnap.docs.map(doc => {
        const d = doc.data();
        return {
          ...d,
          createdAt: d.createdAt?.toDate ? d.createdAt.toDate() : (d.createdAt ? new Date(d.createdAt) : null)
        };
      }).filter(u => u.createdAt);

      // Volunteers
      const volSnap = await getDocs(collection(db, 'Users', 'Info', 'Volunteers'));
      const volData = volSnap.docs.map(doc => {
        const d = doc.data();
        return {
          ...d,
          createdAt: d.createdAt?.toDate ? d.createdAt.toDate() : (d.createdAt ? new Date(d.createdAt) : null)
        };
      }).filter(u => u.createdAt);

      // Events
      const eventsSnap = await getDocs(collection(db, 'Events'));
      const eventsData = eventsSnap.docs.map(doc => {
        const d = doc.data();
        return {
          ...d,
          scheduled_time: d.scheduled_time?.toDate ? d.scheduled_time.toDate() : (d.scheduled_time ? new Date(d.scheduled_time) : null)
        };
      }).filter(e => e.scheduled_time);

      // Set all data
      setMatches(matchesData);
      setSessions(sessionsData);
      setRequesters(reqData);
      setVolunteers(volData);
      setEvents(eventsData);
      setLoading(false);
    }
    fetchAll();
  }, []);

  // Reset timeOffset to 0 when timeType changes
  useEffect(() => {
    setTimeOffset(0);
  }, [timeType]);

  // Aggregate data for chart
  useEffect(() => {
    let items = [];
    let dateField = 'createdAt';
    if (dataType === 'matches') {
      items = matches;
      dateField = 'startDate';
    } else if (dataType === 'sessions') {
      items = sessions;
      dateField = 'createdAt';
    } else if (dataType === 'requesters') {
      items = requesters;
      dateField = 'createdAt';
    } else if (dataType === 'volunteers') {
      items = volunteers;
      dateField = 'createdAt';
    } else if (dataType === 'users') {
      items = [...requesters, ...volunteers];
      dateField = 'createdAt';
    } else if (dataType === 'events') {
      items = events;
      dateField = 'scheduled_time';
    } else if (dataType === 'interested') {
      // For each date, count total interested users in all events for that date
      let data = [];
      const now = new Date();
      let baseDate = new Date(now);
      if (timeType === 'days') {
        baseDate.setDate(now.getDate() + timeOffset * 7);
        for (let i = 6; i >= 0; i--) {
          const d = new Date(baseDate);
          d.setDate(baseDate.getDate() - i);
          const xLabel = formatDate(d, 'days');
          // Sum interested users for all events on this day
          const count = events.reduce((acc, event) => {
            if (!event.scheduled_time) return acc;
            const eventDate = event.scheduled_time;
            if (
              eventDate.getFullYear() === d.getFullYear() &&
              eventDate.getMonth() === d.getMonth() &&
              eventDate.getDate() === d.getDate() &&
              Array.isArray(event.interestedUsers)
            ) {
              return acc + event.interestedUsers.length;
            }
            return acc;
          }, 0);
          data.push({ label: xLabel, count });
        }
      } else if (timeType === 'weeks') {
        baseDate.setDate(now.getDate() + timeOffset * 4 * 7);
        for (let i = 3; i >= 0; i--) {
          const d = new Date(baseDate);
          d.setDate(baseDate.getDate() - i * 7);
          const week = getWeekNumber(d);
          const year = d.getFullYear();
          const xLabel = formatDate(d, 'weeks');
          const count = events.reduce((acc, event) => {
            if (!event.scheduled_time) return acc;
            const eventDate = event.scheduled_time;
            const eventWeek = getWeekNumber(eventDate);
            if (
              eventDate.getFullYear() === year &&
              eventWeek === week &&
              Array.isArray(event.interestedUsers)
            ) {
              return acc + event.interestedUsers.length;
            }
            return acc;
          }, 0);
          data.push({ label: xLabel, count });
        }
      } else if (timeType === 'months') {
        baseDate.setMonth(now.getMonth() + timeOffset * 12);
        for (let i = 11; i >= 0; i--) {
          const d = new Date(baseDate);
          d.setMonth(baseDate.getMonth() - i);
          const xLabel = formatDate(d, 'months');
          const count = events.reduce((acc, event) => {
            if (!event.scheduled_time) return acc;
            const eventDate = event.scheduled_time;
            if (
              eventDate.getFullYear() === d.getFullYear() &&
              eventDate.getMonth() === d.getMonth() &&
              Array.isArray(event.interestedUsers)
            ) {
              return acc + event.interestedUsers.length;
            }
            return acc;
          }, 0);
          data.push({ label: xLabel, count });
        }
      } else if (timeType === 'years') {
        baseDate.setFullYear(now.getFullYear() + timeOffset * 10);
        const years = events.map(event => event.scheduled_time?.getFullYear()).filter(Boolean);
        const minYear = Math.min(...years);
        const maxYear = now.getFullYear();
        for (let y = minYear; y <= maxYear; y++) {
          const xLabel = y.toString();
          const count = events.reduce((acc, event) => {
            if (!event.scheduled_time) return acc;
            const eventDate = event.scheduled_time;
            if (
              eventDate.getFullYear() === y &&
              Array.isArray(event.interestedUsers)
            ) {
              return acc + event.interestedUsers.length;
            }
            return acc;
          }, 0);
          data.push({ label: xLabel, count });
        }
      }
      setChartData(data);
      return;
    }
    if (!items.length) {
      setChartData([]);
      return;
    }

    let data = [];
    const now = new Date();

    let baseDate = new Date(now);
    // Apply timeOffset for navigation
    if (timeType === 'days') {
      baseDate.setDate(now.getDate() + timeOffset * 7);
      for (let i = 6; i >= 0; i--) {
        const d = new Date(baseDate);
        d.setDate(baseDate.getDate() - i);
        const xLabel = formatDate(d, 'days');
        const count = items.filter(item =>
          item[dateField] &&
          item[dateField].getFullYear() === d.getFullYear() &&
          item[dateField].getMonth() === d.getMonth() &&
          item[dateField].getDate() === d.getDate()
        ).length;
        data.push({ label: xLabel, count });
      }
    } else if (timeType === 'weeks') {
      baseDate.setDate(now.getDate() + timeOffset * 4 * 7); // 4 weeks per view
      for (let i = 3; i >= 0; i--) {
        const d = new Date(baseDate);
        d.setDate(baseDate.getDate() - i * 7);
        const week = getWeekNumber(d);
        const year = d.getFullYear();
        const xLabel = formatDate(d, 'weeks');
        const count = items.filter(item => {
          const itemWeek = getWeekNumber(item[dateField]);
          return item[dateField] && item[dateField].getFullYear() === year && itemWeek === week;
        }).length;
        data.push({ label: xLabel, count });
      }
    } else if (timeType === 'months') {
      baseDate.setMonth(now.getMonth() + timeOffset * 12);
      for (let i = 11; i >= 0; i--) {
        const d = new Date(baseDate);
        d.setMonth(baseDate.getMonth() - i);
        const xLabel = formatDate(d, 'months');
        const count = items.filter(item =>
          item[dateField] &&
          item[dateField].getFullYear() === d.getFullYear() &&
          item[dateField].getMonth() === d.getMonth()
        ).length;
        data.push({ label: xLabel, count });
      }
    } else if (timeType === 'years') {
      baseDate.setFullYear(now.getFullYear() + timeOffset * 10);
      const years = items.map(item => item[dateField].getFullYear());
      const minYear = Math.min(...years);
      const maxYear = now.getFullYear();
      for (let y = minYear; y <= maxYear; y++) {
        const xLabel = y.toString();
        const count = items.filter(item => item[dateField] && item[dateField].getFullYear() === y).length;
        data.push({ label: xLabel, count });
      }
    }
    setChartData(data);
  }, [matches, sessions, requesters, volunteers, events, timeType, dataType, timeOffset]);

  return (
    <div className="flex flex-col w-full space-y-4">
      
                        <div className="bg-white rounded-lg shadow p-6">
    <h3 className="font-semibold mb-4 text-orange-700">
            סטטיסטיקה
            </h3>
    <div>
      <div className="flex gap-2 mb-4 flex-wrap items-center">

        {/* Time and data type selectors */}
        {TIME_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => {
              setTimeType(opt.value);
              setTimeOffset(0);
            }}
            className={`px-3 py-1 rounded ${timeType === opt.value ? 'bg-orange-500 text-white' : 'bg-orange-100 text-orange-800'}`}
          >
            {opt.label}
          </button>
        ))}
        
        <span className="mx-2" />
        {DATA_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setDataType(opt.value)}
            className={`px-3 py-1 rounded ${dataType === opt.value ? 'bg-orange-500 text-white' : 'bg-orange-100 text-orange-800'}`}
          >
            {opt.label}
          </button>
        ))}
        {/* Show total interested users for events */}
      </div>
        
      {loading ? (
        <div className="text-center text-orange-700">טוען נתונים...</div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis 
              allowDecimals={false} 
              tickMargin={10}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, textAnchor: 'end', dominantBaseline: 'middle' }}
              width={40}
            />
            <Tooltip />
            <Bar dataKey="count" fill="#f97316" name="כמות" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
          {/* Time navigation buttons styled like dashboard pagination */}
        <div className="flex justify-between items-center mt-4">

          <button
            onClick={() => setTimeOffset(o => o + 1)}
            className="py-2 px-4 text-base sm:py-3 sm:px-6 sm:text-lg border border-orange-600 rounded bg-white text-orange-700 hover:bg-orange-600 hover:text-white disabled:opacity-50 transition-all duration-150"
            style={{ minWidth: '90px' }}
            disabled={false}
          >
            הבא
          </button>
          
          <span className="text-orange-700 font-semibold text-sm">
            {timeType === 'days' && `שבוע נוכחי${timeOffset > 0 ? ` (${timeOffset} קדימה)` : timeOffset < 0 ? ` (${Math.abs(timeOffset)} אחורה)` : ''}`}
            {timeType === 'weeks' && `4 שבועות${timeOffset > 0 ? ` (${timeOffset} קדימה)` : timeOffset < 0 ? ` (${Math.abs(timeOffset)} אחורה)` : ''}`}
            {timeType === 'months' && `12 חודשים${timeOffset > 0 ? ` (${timeOffset} קדימה)` : timeOffset < 0 ? ` (${Math.abs(timeOffset)} אחורה)` : ''}`}
            {timeType === 'years' && `שנים${timeOffset > 0 ? ` (${timeOffset} קדימה)` : timeOffset < 0 ? ` (${Math.abs(timeOffset)} אחורה)` : ''}`}
          </span>
          <button
            onClick={() => setTimeOffset(o => o - 1)}
            className="py-2 px-4 text-base sm:py-3 sm:px-6 sm:text-lg border border-orange-600 rounded bg-white text-orange-700 hover:bg-orange-600 hover:text-white disabled:opacity-50 transition-all duration-150"
            style={{ minWidth: '90px' }}
            disabled={false}
          >
            הקודם
          </button>
        </div>
      </div>
    </div>
  );
}