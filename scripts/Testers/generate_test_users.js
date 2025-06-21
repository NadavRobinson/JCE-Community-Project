/**********************************************************************
 *  GENERATE 10 REQUESTERS + 5 VOLUNTEERS (HEBREW, REAL SENTENCES)   *
 *********************************************************************/

const admin = require("firebase-admin");
const { faker } = require("@faker-js/faker");
const serviceAccount = require("./talksfromtheheartbeta-firebase-adminsdk-fbsvc-e0bbd8598c.json"); 

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db   = admin.firestore();
const auth = admin.auth();

/*─────────────────────────────────────────────────────────────────────*
 |               1. מאגרי שמות פרטיים + משפחה (100+)                  |
 *─────────────────────────────────────────────────────────────────────*/
const hebrewFirstNames = [
  "דוד","שרה","רונית","משה","יוסי","רחל","עדי","לירון","אבי","תמר",
  "אייל","נועה","יצחק","שירה","איתן","הילה","אביגיל","רועי","יובל","טל",
  "אפרת","עמרי","מיכאל","יעל","אליה","ליאור","אורית","שמעון","ענבר","גדי",
  "מירב","מאיה","שחר","אסף","כרמית","עידו","רותם","דן","יואב","אור",
  "מעין","יוכבד","שמואל","מרים","רמי","גיל","אבשלום","אילה","אדל","אביב",
  "אורנה","ליאון","מרדכי","אבנר","נעמי","שני","יונתן","שולמית","אברהם","אלינה",
  "אסנת","ברוך","עדן","סיגל","אלישע","שלי","זאב","רוני","טובה","שמעונה",
  "אופיר","תום","דניאל","אורי","עטרה","אהוד","דינה","שקד","גלי","אביטל",
  "נחמה","טלי","אפרים","אלינור","כרמל","משאל","ציפי","מתן","ליאב","גפן",
  "לירז","תכלת","שחרית","ירון","איה","אסיה","אוריה","גבריאל","אריאל","אדיר"
];
const hebrewLastNames = [
  "כהן","לוי","מזרחי","ברק","שושן","הרשקוביץ","דיין","פרידמן","ביטון","אברג'יל",
  "צור","קפלן","רוט","זליגמן","אלבז","שטרן","חדד","סבן","עמר","בכר",
  "רובין","סלומון","שדה","חזן","טויטו","שושני","פדידה","שטרית","גולן","זיו"
];
const randomHebName = () =>
  `${faker.helpers.arrayElement(hebrewFirstNames)} ${faker.helpers.arrayElement(hebrewLastNames)}`;

/*─────────────────────────────────────────────────────────────────────*
 |      2. מאגר-על של משפטים אמיתיים (100+), מחולק לפי שדות טקסט      |
 *─────────────────────────────────────────────────────────────────────*/

/* 2.1  Requester fields */
const reasonPool = [
  "מרגיש בודד מאז שעברתי דירה ורוצה לשוחח עם מישהו פעם בשבוע.",
  "זקוקה לאוזן קשבת לאחר אובדן בן זוגי.",
  "מתמודד עם דיכאון קל ומאמין ששיחות קבועות יעזרו לי.",
  "בתהליך גירושים ומחפש שותף לשיחה לא פורמלית.",
  "אין לי משפחה קרובה בארץ ואני רוצה להכיר אנשים חדשים.",
  "מתאושש מניתוח ומוגבל בתנועה, אשמח לקשר אנושי טלפוני.",
  "מחפשת שיחות בעברית לתרגול השפה לאחר עלייתי ארצה.",
  "מרגיש צורך לחלוק סיפורי ילדות עם מישהו שמקשיב.",
  "סובל מבדידות בסופי השבוע ומעוניין בליווי רגשי.",
  "מעוניינת לדבר עם מישהו על ספרות ומוזיקה קלאסית.",
  "חווה חרדה חברתית ומעדיף להתחיל בשיחות טלפוניות.",
  "זקוקה לעידוד בתקופה של אי-ודאות כלכלית.",
  "רוצה לקבל פרספקטיבה צעירה על העולם.",
  "מתגוררת לבד ורוצה לשמוע קול אנושי מדי יום.",
  "טיפולי פיזיותרפיה מגבילים יציאה מהבית ואני משתוקקת לשיחות.",
  "מעוניין לשוחח על אקטואליה עם אדם מעודכן.",
  "מחפש בן שיח עם עניין בטכנולוגיה וחדשנות.",
  "זקוקה לתמיכה לאחר מעבר למגורים בבית אבות.",
  "מבקש לדבר על טיולים בארץ ובעולם.",
  "מעוניינת לשתף מתכונים ולדבר על בישול."
];

const needsPool = [
  "שיחות טלפוניות בנות חצי שעה אחת לשבוע.",
  "פגישות וידאו בזום פעמיים בחודש.",
  "שיחת טלפון קצרה בכל יום ראשון בבוקר.",
  "הודעות וואטסאפ קוליות בזמן ערב.",
  "שיחה עומק של שעה פעם בשבועיים.",
  "שיחות טלפון תמיכה במהלך טיפולים רפואיים.",
  "ליווי רגשי יומיומי קצר בוואטסאפ.",
  "שיחת וידאו בסוף השבוע לשיחת חולין.",
  "שיחות בוקר בימי חול כדי לפתוח את היום בחיוך.",
  "ביקור טלפוני ערב לפני שבת."
];

const chatPrefPool = [
  "שיחת טלפון בלבד",
  "וידאו-זום",
  "וואטסאפ קול",
  "סמס והשלמת שיחה טלפונית",
  "טלפון או סקייפ לפי נוחות",
  "טלפון – רצוי עם מצלמה כבויה",
  "זום בקבוצה קטנה",
  "צ'אט כתוב פלוס שיחת טלפון שבועית",
  "הודעות קוליות בוואטסאפ לאורך היום",
  "טלפון או פייסבוק מסנג'ר"
];

const frequencyPool = [
  "פעם בשבוע",
  "פעמיים בשבוע",
  "שלוש פעמים בשבוע",
  "פעם בשבועיים",
  "יומי – הודעה קצרה"
];

const preferredTimesPool = [
  "בוקר מוקדם",
  "שעות הבוקר המאוחרות",
  "צהריים",
  "אחה״צ",
  "ערב",
  "לילה"
];

const volunteerPrefsPool = [
  "מתנדב סבלני עם חוש הומור.",
  "מישהי עם ניסיון בטיפול רגשי.",
  "מתנדב דובר רוסית בנוסף לעברית.",
  "אדם שאוהב ספרים ושיחה עמוקה.",
  "צעיר טכנולוגי שמבין באפליקציות.",
  "מישהי בגילי עם תחומי עניין דומים.",
  "סטודנט לפסיכולוגיה שיודע להקשיב.",
  "אדם חביב שמוכן לשוחח גם על פוליטיקה.",
  "מתנדב שמכיר מוזיקה ישראלית ישנה.",
  "מישהי שאוהבת בישול ושיתוף מתכונים."
];

/* 2.2  Volunteer fields */
const professionPool = [
  "עובד סוציאלי", "פסיכולוגית", "סטודנט לרפואה", "מדריכת יוגה", "מהנדס תוכנה",
  "מורה להיסטוריה", "דיאטנית קלינית", "מתכנן ערים", "מאמן כושר", "מנחת קבוצות"
];

const experiencePool = [
  "התנדבתי שלוש שנים עם בני נוער במצוקה.",
  "ליוויתי קשישים בבית אבות והעברתי פעילויות יצירה.",
  "הדרכתי קבוצת עולים חדשים בלימודי עברית.",
  "שירתתי כמפקד בחינוך בצה״ל עם דגש על הובלת ערכים.",
  "ניהלתי פרויקט חברתי לטיפוח קהילה מקומית.",
  "העברתי סדנאות העצמה לנשים בפריפריה.",
  "חנכתי סטודנטים שנה א' באוניברסיטה.",
  "למדתי קורס עזרה ראשונה והדרכתי נוער.",
  "עבודה שוטפת עם אנשים עם מוגבלויות.",
  "ריכזתי מועדונית לילדים אחרי בית ספר."
];

const strengthsPool = [
  "אמפתיה, הקשבה, סבלנות",
  "יצירתיות וגישה חיובית",
  "חוש הומור, קלילות, אופטימיות",
  "יכולת הכלה ושפה עשירה",
  "דיסקרטיות ואמינות גבוהה",
  "יכולות הנחייה והדרכה",
  "מוטיבציה גבוהה ולב פתוח",
  "דיבור בהיר וברור",
  "יכולת פתרון בעיות במהירות",
  "גישה טכנולוגית וחדשנית"
];

const motivationPool = [
  "מאמינה בכוח של מילים לשנות מציאות.",
  "רוצה להחזיר לקהילה וללמוד על עצמי בתהליך.",
  "שואפת להכיר אנשים מרקעים שונים ולהרחיב אופקים.",
  "מעוניין לתרום מזמני הפנוי ולהרגיש משמעות.",
  "בתור בן יחיד, חשוב לי לסייע לאנשים בודדים.",
  "אוהבת לשוחח ולהעניק פרספקטיבה אופטימית.",
  "מרגישה ששליחותי היא לעזור לבני אדם בצמתי חיים.",
  "רוצה לצבור ניסיון לקראת לימודי טיפול רגשי.",
  "שואפת ליצור חיבור אנושי עמוק בעולם דיגיטלי.",
  "מבקשת להמשיך במסורת משפחתית של נתינה."
];

const availableHoursPool = [
  "בוקר", "צהריים", "אחה״צ", "ערב", "לילה", "גמיש כל היום"
];

/*─────────────────────────────────────────────────────────────────────*
 |               3. פונקציות שירות / יצירת אימיילים                   |
 *─────────────────────────────────────────────────────────────────────*/
const rand       = (pool) => faker.helpers.arrayElement(pool);
const randGender = ()   => faker.helpers.arrayElement(["זכר","נקבה"]);
const randCity   = ()   => faker.helpers.arrayElement(["ירושלים","תל אביב","חיפה","רמת גן","באר שבע","פתח תקווה"]);

const reqEmail = (i) => `req${i}T@test.com`;
const reqPass  = (i) => `req${i}Ttest`;
const volEmail = (i) => `vol${i}T@test.com`;
const volPass  = (i) => `vol${i}Ttest`;

const getRandomDateInLastMonth = () => {
  const now = new Date();
  const ninetyDaysAgo = new Date(now.setDate(now.getDate() - 90));
  const randomTime = ninetyDaysAgo.getTime() + Math.random() * (new Date().getTime() - ninetyDaysAgo.getTime());
  return new Date(randomTime);
};

/*─────────────────────────────────────────────────────────────────────*
 |                            4. GENERATE                              |
 *─────────────────────────────────────────────────────────────────────*/
async function generate() {
  const requesterCount = 1;   // מספר מבקשים
  const volunteerCount = 1;    // מספר מתנדבים
  const startId        = 1;    // מתחילים מ-1 לשני הסוגים

  console.log(`\n➤ יוצר ${requesterCount} מבקשים ו-${volunteerCount} מתנדבים (IDs 1..)…\n`);

  // Add pools for behalfName and behalfDetails
  const behalfNamePool = [
    "דוד לוי", "שרה כהן", "משה מזרחי", "רונית ברק", "יוסי הרשקוביץ", "רחל דיין", "עדי פרידמן", "לירון ביטון", "אבי אברג'יל", "תמר צור"
  ];
  const behalfDetailsPool = [
    "אח של הפונה", "חבר מהעבודה", "שכן קרוב", "מטפל סוציאלי", "מורה בבית הספר", "בן משפחה רחוק", "קולגה לשעבר", "חבר ילדות", "מדריך בתנועת נוער", "שכן בבניין"
  ];

  // --- Requesters ---------------------------------------------------
  for (let i = 0; i < requesterCount; i++) {
    const id = startId + i;
    const email = reqEmail(id);
    const pass  = reqPass(id);
    const { uid } = await auth.createUser({ email, password: pass });

    // Randomly decide if this requester is on behalf of someone else
    const isBehalf = Math.random() < 0.5; // 50% chance
    const behalfName = isBehalf ? faker.helpers.arrayElement(behalfNamePool) : "";
    const behalfDetails = isBehalf ? faker.helpers.arrayElement(behalfDetailsPool) : "";
    const onBehalfOf = isBehalf ? "אדם אחר בידיעתו" : "עצמי";

    await db.doc(`Users/Info/Requesters/${uid}`).set({
      email,
      fullName: randomHebName(),
      onBehalfOf,
      behalfDetails,
      behalfName,
      gender: randGender(),
      age: faker.number.int({ min: 18, max: 90 }),
      maritalStatus: rand(["נשוי","גרוש","אלמן"]),
      location: randCity(),
      phone: faker.phone.number("05#-###-####"),
      reason: rand(reasonPool),
      needs: rand(needsPool),
      chatPref: [rand(chatPrefPool)],
      frequency: [rand(frequencyPool)],
      preferredTimes: rand(preferredTimesPool),
      volunteerPrefs: rand(volunteerPrefsPool),
      agree1: true,
      agree2: true,
      agree3: true,
      note: "",
      personal: true,
      activeMatchId: null,
      approved: "true",
      createdAt: new Date(),
      lastActivity: getRandomDateInLastMonth()
    });

    await db.collection("Requests").add({
      requesterId: uid,
      volunteerId: null,
      matchId: null,
      status: "waiting_for_first_approval",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`   ✓ Requester ${email} נוצר`);
  }

  // --- Volunteers ---------------------------------------------------
  for (let i = 0; i < volunteerCount; i++) {
    const id = startId + i;
    const email = volEmail(id);
    const pass  = volPass(id);
    const { uid } = await auth.createUser({ email, password: pass });

    await db.doc(`Users/Info/Volunteers/${uid}`).set({
      email,
      fullName: randomHebName(),
      phone: faker.phone.number("05#-###-####"),
      location: randCity(),
      age: faker.number.int({ min: 18, max: 60 }),
      gender: randGender(),
      maritalStatus: rand(["רווק","נשוי"]),
      profession: rand(professionPool),
      experience: rand(experiencePool),
      availableDays: faker.helpers.arrayElements(
        ["ראשון","שני","שלישי","רביעי","חמישי","שישי"], 3
      ),
      availableHours: [rand(availableHoursPool)],
      strengths: rand(strengthsPool),
      motivation: rand(motivationPool),
      agree: true,
      approved: "pending",
      personal: true,
      isAvailable: true,
      activeMatchIds: [],
      requestIds: [],
      createdAt: new Date(),
      lastActivity: getRandomDateInLastMonth()
    });

    console.log(`   ✓ Volunteer ${email} נוצר`);
  }

  console.log("\n🎉  הסתיים יצירת כל משתמשי הבדיקה.\n");
}

generate().catch(console.error);
