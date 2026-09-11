/* Course structure. Add a video to a chapter by filling in `video`, `duration` and `markers`. */
window.COURSE = {
  title: "9 עקרונות העבודה עם Claude Code",
  subtitle: "קורס וידאו",
  author: "אבי לוי",
  blog: "https://www.avilevi.co.il",
  youtube: "https://www.youtube.com/channel/UCdz7iR7sYg2gevHXEyeeM1Q",
  intro: { video: "web-media/intro.mp4", poster: "imgs/intro-poster.jpg", duration: 26.88 },
  chapters: [
    {
      n: 1,
      title: "סביבת עבודה",
      subtitle: "איפה עובדים עם Claude Code",
      oneliner: "טרמינל, אפליקציה או IDE: אותו כלי, שלוש דלתות כניסה.",
      thumb: "imgs/thumbs/ch1.jpg",
      poster: "imgs/thumbs/ch1.jpg",
      video: "web-media/ch1.mp4",
      duration: 463,
      markers: [
        { t: 0,     title: "מה זה בעצם Claude Code" },
        { t: 17.3,  title: "המוח והמעטפת (Harness)" },
        { t: 32.3,  title: "שלוש הדרכים להפעיל" },
        { t: 53.3,  title: "התקנה מהטרמינל" },
        { t: 178,   title: "פקודות בסיס: cd ו-ls" },
        { t: 228,   title: "המודל שקלוד קוד עובד איתו" },
        { t: 300,   title: "אפליקציית שולחן העבודה" },
        { t: 331,   title: "מעבר למצב Claude Code באפליקציה" },
        { t: 372,   title: "עבודה מתוך IDE" },
        { t: 424,   title: "חלון הפקודות ⌘⇧P" },
        { t: 455.5, title: "סיכום: שלוש הדרכים" }
      ]
    },
    {
      n: 2,
      title: "מודלים ורמת מאמץ",
      subtitle: "איזה מודל ואיזו רמת מאמץ לכל משימה",
      oneliner: "מודל חזק לתכנון, מודל זול לביצוע. זה מה שקובע כמה תשלמו.",
      thumb: "imgs/thumbs/ch2.jpg",
      poster: "imgs/thumbs/ch2.jpg",
      video: "web-media/ch2.mp4",
      duration: 332.6,
      markers: [
        { t: 0,     title: "איפה בוחרים מודל" },
        { t: 44.1,  title: "המודלים משתנים עם הזמן" },
        { t: 70,    title: "Haiku ו-Sonnet" },
        { t: 114.8, title: "Opus — מודל של חשיבה" },
        { t: 147.5, title: "Fable, ואחיו Mythos" },
        { t: 199,   title: "Fable — המודל לתכנון" },
        { t: 221,   title: "מהי רמת מאמץ (Effort)" },
        { t: 250.4, title: "מתי מאמץ גבוה לא שווה" },
        { t: 276.5, title: "כלל אצבע: שלב התכנון" },
        { t: 300.1, title: "כלל אצבע: שלב הביצוע" }
      ]
    },
    {
      n: 3,
      title: "תכנון לפני בנייה",
      subtitle: "קודם מתכננים, אחר כך בונים",
      oneliner: "מצב תכנון חוסך את רוב התיקונים, והטוקנים שלו מחזירים את עצמם.",
      thumb: "imgs/thumbs/ch3.jpg",
      poster: "imgs/thumbs/ch3.jpg",
      video: "web-media/ch3.mp4",
      duration: 545.03,
      markers: [
        { t: 0,     title: "למה מתכננים לפני שבונים" },
        { t: 22.1,  title: "תפריט מצבי העבודה" },
        { t: 37.9,  title: "ארבעת מצבי העבודה" },
        { t: 72.2,  title: "מה מצב תכנון עושה" },
        { t: 90.7,  title: "כותבים את הפרומפט" },
        { t: 152.6, title: "שני דגשים לפרומפט טוב" },
        { t: 188.5, title: "מונה הטוקנים וסריקת הקבצים" },
        { t: 235.3, title: "טוקנים של תכנון הם השקעה" },
        { t: 263.8, title: "שאלות הבהרה בפעולה" },
        { t: 344.2, title: "מאשרים את התוכנית ועוברים לביצוע" },
        { t: 366.3, title: "לתקן תוכנית, להחליף מודל" },
        { t: 393,   title: "חמישה דגשים לפני שבונים" },
        { t: 498.5, title: "התוצאה" },
        { t: 538,   title: "סיום ומה בפרק הבא" }
      ]
    },
    {
      n: 4,
      title: "ניהול טוקנים וחלון ההקשר",
      subtitle: "הזיכרון לטווח קצר של קלוד",
      oneliner: "לכל שיחה יש חלון בגודל קבוע. כשהוא מתמלא, האיכות יורדת.",
      thumb: "imgs/thumbs/ch4.jpg",
      poster: "imgs/thumbs/ch4.jpg",
      video: "web-media/ch4.mp4",
      duration: 325.27,
      markers: [
        { t: 0,     title: "מה זה טוקן" },
        { t: 15.6,  title: "כמה טוקנים יש במילה אחת" },
        { t: 29.2,  title: "חלון ההקשר — הזיכרון לטווח קצר" },
        { t: 45.6,  title: "קו ה-70% ואיכות התשובות" },
        { t: 60.5,  title: "הפקודה context/ בפועל" },
        { t: 80.6,  title: "המכסה שמתאפסת כל חמש שעות" },
        { t: 117,   title: "גודל החלון לפי סוג המנוי" },
        { t: 160,   title: "מה תופס מקום בחלון" },
        { t: 189.3, title: "כל הודעה שולחת את כל השיחה מחדש" },
        { t: 202.6, title: "כלים, MCP וסקילים יושבים בחלון" },
        { t: 231.4, title: "שני הכללים: compact/ וסשן חדש" },
        { t: 241,   title: "מריצים compact/ עם הנחיה" },
        { t: 269,   title: "מה compact/ באמת עושה" },
        { t: 307.7, title: "סשן אחד לכל משימה" },
        { t: 317.2, title: "סיום ומה בפרק הבא" }
      ]
    },
    { n: 5, title: "הנחיות וזיכרון", thumb: "imgs/thumbs/ch5.jpg", subtitle: "מה קלוד יודע עליכם בכל סשן", oneliner: "קובץ הנחיות טוב חוסך לחזור על אותם הסברים בכל פעם." },
    { n: 6, title: "סקילים", thumb: "imgs/thumbs/ch6.jpg", subtitle: "מלמדים את קלוד איך אתם רוצים שדברים ייעשו", oneliner: "סקיל הוא נוהל עבודה כתוב, שקלוד שולף בדיוק כשצריך אותו." },
    { n: 7, title: "חיבור לכלים", thumb: "imgs/thumbs/ch7.jpg", subtitle: "מחברים את קלוד לכלים שלכם", oneliner: "קונקטורים ושרתי MCP נותנים לקלוד גישה למייל, ליומן ולקבצים." },
    { n: 8, title: "הוקים", thumb: "imgs/thumbs/ch8.jpg", subtitle: "פעולות שתמיד קורות", oneliner: "הוק הוא כלל קשיח שרץ בכל פעם, בלי לסמוך על הזיכרון של קלוד." },
    { n: 9, title: "רוטינות", thumb: "imgs/thumbs/ch9.jpg", subtitle: "אוטומציות מתוזמנות שרצות בענן", oneliner: "משימה שרצה לבד בזמן קבוע, גם כשהמחשב שלכם סגור." }
  ]
};
