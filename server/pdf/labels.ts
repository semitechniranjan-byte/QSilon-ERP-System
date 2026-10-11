export type Lang = 'en' | 'hi';
const L = {
  feeReceipt: ['FEE RECEIPT', 'शुल्क रसीद'],
  receiptNo: ['Receipt No.', 'रसीद संख्या'],
  date: ['Payment Date', 'भुगतान तिथि'],
  studentName: ['Student Name', 'विद्यार्थी का नाम'],
  studentId: ['Student ID', 'विद्यार्थी आईडी'],
  admissionNo: ['Admission No.', 'प्रवेश संख्या'],
  rollNo: ['Roll No.', 'अनुक्रमांक'],
  classSection: ['Class / Section', 'कक्षा / वर्ग'],
  academicYear: ['Academic Year', 'शैक्षणिक वर्ष'],
  guardian: ['Parent / Guardian', 'अभिभावक'],
  particulars: ['Particulars', 'विवरण'],
  period: ['Period', 'अवधि'],
  amount: ['Amount', 'राशि'],
  concession: ['Concession', 'रियायत'],
  due: ['Due', 'देय'],
  paid: ['Paid', 'भुगतान'],
  totalDue: ['Total fees due (before this payment)', 'कुल देय शुल्क (इस भुगतान से पहले)'],
  previousBalance: ['Previous balance (earlier months)', 'पिछला बकाया'],
  concessions: ['Concessions / waivers applied', 'रियायत / छूट'],
  amountPaid: ['Amount paid', 'भुगतान की गई राशि'],
  remaining: ['Remaining balance', 'शेष बकाया'],
  mode: ['Payment mode', 'भुगतान का माध्यम'],
  reference: ['Transaction reference', 'लेन-देन संदर्भ'],
  receivedBy: ['Received by', 'प्राप्तकर्ता'],
  feesCleared: ['FEES CLEARED', 'शुल्क पूर्ण भुगतान'],
  balanceRemaining: ['BALANCE REMAINING', 'शेष राशि बकाया'],
  sigSchool: ['Authorized Signatory (School)', 'अधिकृत हस्ताक्षर (विद्यालय)'],
  sigParent: ['Parent / Guardian Signature', 'अभिभावक के हस्ताक्षर'],
  sigStudent: ['Student Signature', 'विद्यार्थी के हस्ताक्षर'],
  computerGenerated: ['This receipt is generated from a recorded payment. Signatures are valid only when signed by hand.',
    'यह रसीद दर्ज भुगतान से बनाई गई है। हस्ताक्षर केवल हस्तलिखित होने पर मान्य हैं।'],
  cancelled: ['CANCELLED', 'रद्द'],
  reprint: ['Reprint', 'पुनर्मुद्रण'],
  cash: ['Cash', 'नकद'], bank_transfer: ['Bank transfer', 'बैंक ट्रांसफर'], upi: ['UPI', 'यूपीआई'], card: ['Card', 'कार्ड'], cheque: ['Cheque', 'चेक'], other: ['Other', 'अन्य'],
  reportCard: ['REPORT CARD', 'प्रगति पत्र'],
  progressCard: ['PROGRESS CARD', 'प्रगति पत्र'],
  subject: ['Subject', 'विषय'], maxMarks: ['Max', 'पूर्णांक'], obtained: ['Obtained', 'प्राप्तांक'], grade: ['Grade', 'ग्रेड'], result: ['Result', 'परिणाम'],
  total: ['Total', 'योग'], percentage: ['Percentage', 'प्रतिशत'], attendance: ['Attendance', 'उपस्थिति'],
  pass: ['PASS', 'उत्तीर्ण'], passShort: ['Pass', 'उत्तीर्ण'], failShort: ['Below pass', 'अनुत्तीर्ण'], fail: ['NEEDS IMPROVEMENT', 'सुधार आवश्यक'], absent: ['AB', 'अनु.'],
  teacherRemark: ['Class Teacher\'s Remarks', 'कक्षा शिक्षक की टिप्पणी'], principalRemark: ['Principal\'s Remarks', 'प्रधानाचार्य की टिप्पणी'],
  sigClassTeacher: ['Class Teacher', 'कक्षा शिक्षक'], sigPrincipal: ['Principal', 'प्रधानाचार्य'],
  domain: ['Learning Area', 'अधिगम क्षेत्र'], rating: ['Progress', 'प्रगति'], comment: ['Comment', 'टिप्पणी'],
  beginning: ['Beginning', 'प्रारंभिक'], developing: ['Developing', 'विकासशील'], proficient: ['Proficient', 'दक्ष'], excellent: ['Excellent', 'उत्कृष्ट'],
  exam: ['Examination', 'परीक्षा'], dob: ['Date of Birth', 'जन्म तिथि'],
} as const;
export type LabelKey = keyof typeof L;
export const t = (lang: Lang, k: LabelKey) => L[k][lang === 'hi' ? 1 : 0];

export function inr(paise: number): string {
  const neg = paise < 0;
  const a = Math.abs(paise);
  return `${neg ? '-' : ''}₹${Math.floor(a / 100).toLocaleString('en-IN')}.${String(a % 100).padStart(2, '0')}`;
}
export function fmtDate(d: string) {
  const [y, m, dd] = d.slice(0, 10).split('-');
  return `${dd}/${m}/${y}`;
}
