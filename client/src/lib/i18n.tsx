import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Lang = 'en' | 'hi';

/** Hindi translations keyed by the English UI text. Missing keys fall back to English. */
const HI: Record<string, string> = {
  // Navigation & common
  'Home': 'होम', 'About Us': 'हमारे बारे में', 'Academics': 'शैक्षणिक', 'Preschool': 'प्री-स्कूल', 'Hostel': 'छात्रावास', 'Facilities': 'सुविधाएँ',
  'Gallery': 'गैलरी', 'Notices': 'सूचनाएँ', 'Contact Us': 'संपर्क करें', 'Admission Enquiry': 'प्रवेश पूछताछ', 'Login': 'लॉगिन', 'Logout': 'लॉग आउट',
  'Dashboard': 'डैशबोर्ड', 'Students': 'विद्यार्थी', 'Teachers': 'शिक्षक', 'Admissions': 'प्रवेश', 'Classes & Sections': 'कक्षाएँ एवं वर्ग',
  'Subjects': 'विषय', 'Timetable': 'समय सारणी', 'Attendance': 'उपस्थिति', 'Fees': 'शुल्क', 'Collect Fee': 'शुल्क जमा करें', 'Receipts': 'रसीदें',
  'Fee Plans': 'शुल्क योजनाएँ', 'Invoices': 'चालान', 'Reports': 'रिपोर्ट', 'Examinations': 'परीक्षाएँ', 'Exams': 'परीक्षाएँ', 'Results': 'परिणाम',
  'Assignments': 'गृहकार्य', 'Quizzes': 'क्विज़', 'Study Materials': 'अध्ययन सामग्री', 'Notices & Events': 'सूचनाएँ एवं कार्यक्रम', 'Events': 'कार्यक्रम',
  'Settings': 'सेटिंग्स', 'Website': 'वेबसाइट', 'Users & Access': 'उपयोगकर्ता एवं अधिकार', 'Audit Log': 'ऑडिट लॉग', 'Transport': 'परिवहन',
  'My Classes': 'मेरी कक्षाएँ', 'Marks Entry': 'अंक प्रविष्टि', 'Profile': 'प्रोफ़ाइल', 'My Profile': 'मेरी प्रोफ़ाइल', 'My Results': 'मेरे परिणाम',
  'My Fees': 'मेरा शुल्क', 'Enquiries': 'पूछताछ', 'Promotion': 'पदोन्नति', 'Concessions': 'रियायतें', 'Corrections': 'सुधार अनुरोध',
  'Save': 'सहेजें', 'Cancel': 'रद्द करें', 'Edit': 'संपादित करें', 'Delete': 'हटाएँ', 'Add': 'जोड़ें', 'Create': 'बनाएँ', 'Search': 'खोजें',
  'Submit': 'जमा करें', 'Close': 'बंद करें', 'Confirm': 'पुष्टि करें', 'Back': 'वापस', 'View': 'देखें', 'Print': 'प्रिंट करें',
  'Download PDF': 'PDF डाउनलोड करें', 'Export CSV': 'CSV निर्यात', 'Export Excel': 'Excel निर्यात', 'Loading…': 'लोड हो रहा है…',
  'No records found.': 'कोई रिकॉर्ड नहीं मिला।', 'Something went wrong.': 'कुछ गलत हो गया।', 'Saved successfully.': 'सफलतापूर्वक सहेजा गया।',
  'Actions': 'कार्रवाई', 'Status': 'स्थिति', 'Date': 'तिथि', 'Name': 'नाम', 'Class': 'कक्षा', 'Section': 'वर्ग', 'Roll No.': 'अनुक्रमांक',
  'Student ID': 'विद्यार्थी आईडी', 'Admission No.': 'प्रवेश संख्या', 'Academic Year': 'शैक्षणिक वर्ष', 'Board': 'बोर्ड', 'Medium': 'माध्यम',
  'Subject': 'विषय', 'Teacher': 'शिक्षक', 'Phone': 'फ़ोन', 'Email': 'ईमेल', 'Address': 'पता', 'Amount': 'राशि', 'Total': 'कुल',
  'Balance': 'शेष', 'Paid': 'भुगतान', 'Due': 'देय', 'Outstanding': 'बकाया', 'Overdue': 'अतिदेय', 'Fees Cleared': 'शुल्क पूर्ण',
  'Present': 'उपस्थित', 'Absent': 'अनुपस्थित', 'Late': 'देर से', 'Half-day': 'आधा दिन', 'Leave': 'अवकाश', 'All': 'सभी',
  'Guardian': 'अभिभावक', 'Parent / Guardian': 'माता-पिता / अभिभावक', 'Date of Birth': 'जन्म तिथि', 'Gender': 'लिंग', 'Male': 'पुरुष', 'Female': 'महिला', 'Other': 'अन्य',
  'Day scholar': 'दैनिक विद्यार्थी', 'Hostel resident': 'छात्रावासी', 'Yes': 'हाँ', 'No': 'नहीं', 'Language': 'भाषा', 'Change password': 'पासवर्ड बदलें',
  // Public site
  'Welcome to': 'स्वागत है', 'Apply for Admission': 'प्रवेश हेतु आवेदन', 'Our Mission': 'हमारा लक्ष्य', 'Students enrolled': 'नामांकित विद्यार्थी',
  'Classes offered': 'कक्षाएँ', 'Years of excellence': 'उत्कृष्टता के वर्ष', 'Latest Notices': 'नवीनतम सूचनाएँ',
  'Upcoming Events': 'आगामी कार्यक्रम', 'Boards & Medium': 'बोर्ड एवं माध्यम', 'Classes': 'कक्षाएँ', 'Read more': 'और पढ़ें',
  'Send enquiry': 'पूछताछ भेजें', 'Child’s name': 'बच्चे का नाम', 'Class sought': 'इच्छित कक्षा', 'Parent’s name': 'अभिभावक का नाम',
  'Message': 'संदेश', 'Hostel required': 'छात्रावास चाहिए', 'Transport required': 'परिवहन चाहिए', 'Thank you! The school office will contact you soon.': 'धन्यवाद! विद्यालय कार्यालय शीघ्र आपसे संपर्क करेगा।',
  'Open map': 'मानचित्र खोलें', 'Get in touch': 'संपर्क करें', 'From Playgroup to Class 12': 'प्ले ग्रुप से कक्षा 12 तक',
  // Auth
  'Sign in': 'साइन इन करें', 'User ID': 'उपयोगकर्ता आईडी', 'Password': 'पासवर्ड', 'Forgot password?': 'पासवर्ड भूल गए?',
  'Current password': 'वर्तमान पासवर्ड', 'New password': 'नया पासवर्ड', 'Confirm new password': 'नए पासवर्ड की पुष्टि करें',
  // Dashboards
  'Total students': 'कुल विद्यार्थी', 'Active teachers': 'सक्रिय शिक्षक', 'Preschool enrollment': 'प्री-स्कूल नामांकन', 'Hostel residents': 'छात्रावासी',
  'Day scholars': 'दैनिक विद्यार्थी', 'Today’s attendance': 'आज की उपस्थिति', 'Collected today': 'आज का संग्रह', 'This month': 'इस माह',
  'New admissions': 'नए प्रवेश', 'Upcoming exams': 'आगामी परीक्षाएँ', 'Recent notices': 'हाल की सूचनाएँ', 'Recent activity': 'हाल की गतिविधि',
  'Today’s timetable': 'आज की समय सारणी', 'Attendance tasks': 'उपस्थिति कार्य', 'Assigned classes': 'आवंटित कक्षाएँ', 'Pending reviews': 'लंबित समीक्षाएँ',
  'Attendance %': 'उपस्थिति %', 'Latest result': 'नवीनतम परिणाम', 'Upcoming tests': 'आगामी परीक्षण', 'Homework': 'गृहकार्य',
  'Mark attendance': 'उपस्थिति दर्ज करें', 'Record payment': 'भुगतान दर्ज करें', 'Report card': 'प्रगति पत्र', 'Grade': 'ग्रेड', 'Marks': 'अंक',
  'Percentage': 'प्रतिशत', 'Remarks': 'टिप्पणी', 'Max marks': 'पूर्णांक', 'Due date': 'अंतिम तिथि', 'Submitted': 'जमा किया', 'Pending': 'लंबित', 'Completed': 'पूर्ण',
  'Start quiz': 'क्विज़ शुरू करें', 'Time left': 'शेष समय', 'Fee statement': 'शुल्क विवरण', 'Payment history': 'भुगतान इतिहास',
  'Request correction': 'सुधार का अनुरोध', 'Hindi': 'हिन्दी', 'English': 'English',
};

interface I18n { lang: Lang; setLang: (l: Lang) => void; t: (s: string) => string; pick: (en?: string | null, hi?: string | null) => string }
const Ctx = createContext<I18n>({ lang: 'en', setLang: () => {}, t: (s) => s, pick: (en) => en ?? '' });

function initialLang(): Lang {
  try {
    const v = localStorage.getItem('lang');
    if (v === 'en' || v === 'hi') return v;
  } catch { /* storage unavailable */ }
  return 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const setLang = (l: Lang) => {
    setLangState(l);
    try { localStorage.setItem('lang', l); } catch { /* ignore */ }
  };
  const t = (s: string) => (lang === 'hi' ? HI[s] ?? s : s);
  const pick = (en?: string | null, hi?: string | null) => (lang === 'hi' && hi ? hi : en ?? '');
  return <Ctx.Provider value={{ lang, setLang, t, pick }}>{children}</Ctx.Provider>;
}
export const useI18n = () => useContext(Ctx);
