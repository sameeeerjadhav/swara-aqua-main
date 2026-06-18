// ── Staff Translations: English + Marathi ─────────────────────────────────────

export type Lang = 'en' | 'mr';

const translations = {
  // ── Nav labels ───────────────────────────────────────────────────────────────
  nav_dashboard:   { en: 'Dashboard',  mr: 'डॅशबोर्ड' },
  nav_deliveries:  { en: 'Deliveries', mr: 'डिलिव्हरी' },
  nav_customers:   { en: 'Customers',  mr: 'ग्राहक' },
  nav_casual:      { en: 'Casual',     mr: 'सामान्य' },
  nav_inventory:   { en: 'Inventory',  mr: 'साठा' },

  // ── Common ───────────────────────────────────────────────────────────────────
  refresh:         { en: 'Refresh',    mr: 'रिफ्रेश' },
  search:          { en: 'Search by name or phone...', mr: 'नाव किंवा फोन शोधा...' },
  cancel:          { en: 'Cancel',     mr: 'रद्द करा' },
  save:            { en: 'Save',       mr: 'जतन करा' },
  done:            { en: 'Done',       mr: 'पूर्ण' },
  notes:           { en: 'Notes',      mr: 'नोंद' },
  notes_optional:  { en: 'Notes (optional)', mr: 'नोंद (ऐच्छिक)' },
  notes_ph:        { en: 'e.g. Left at gate, customer not home...', mr: 'उदा. दरवाजाबाहेर ठेवले, ग्राहक घरी नाही...' },
  amount:          { en: 'Amount',     mr: 'रक्कम' },
  payment:         { en: 'Payment',    mr: 'पेमेंट' },
  cash:            { en: 'Cash',       mr: 'रोख' },
  online:          { en: 'Online',     mr: 'ऑनलाइन' },
  credit:          { en: 'Credit',     mr: 'उधार' },
  pay_later:       { en: 'Pay Later',  mr: 'नंतर द्या' },
  navigate:        { en: 'Navigate',   mr: 'नेव्हिगेट' },
  delete:          { en: 'Delete',     mr: 'हटवा' },

  // ── Home ─────────────────────────────────────────────────────────────────────
  good_morning:    { en: 'Good morning',   mr: 'शुभ सकाळ' },
  good_afternoon:  { en: 'Good afternoon', mr: 'शुभ दुपार' },
  good_evening:    { en: 'Good evening',   mr: 'शुभ संध्याकाळ' },
  ready_today:     { en: "Ready for today's deliveries", mr: 'आजच्या डिलिव्हरीसाठी तयार' },
  todays_progress: { en: "Today's progress", mr: 'आजची प्रगती' },
  delivered:       { en: 'Delivered',    mr: 'डिलिव्हर' },
  jars_out:        { en: 'Jars Out',     mr: 'जार बाहेर' },
  collected:       { en: 'Collected',    mr: 'गोळा केले' },
  pending:         { en: 'Pending',      mr: 'प्रलंबित' },
  jars_with_you:   { en: 'Jars with you', mr: 'तुमच्याकडे जार' },
  empties_back:    { en: 'empties back', mr: 'रिकामे परत' },
  cash_in_hand:    { en: 'Cash in hand', mr: 'हातात रोख' },
  pending_submission: { en: 'Pending submission', mr: 'सबमिशन प्रतीक्षेत' },
  assigned_orders: { en: 'Assigned Orders', mr: 'नियुक्त ऑर्डर' },
  awaiting_delivery: { en: 'awaiting delivery', mr: 'डिलिव्हरी प्रतीक्षेत' },
  view_all:        { en: 'View all',     mr: 'सर्व पहा' },
  all_caught_up:   { en: 'All caught up! 🎉', mr: 'सर्व पूर्ण! 🎉' },
  no_pending_deliveries: { en: 'No pending deliveries assigned to you.', mr: 'तुम्हाला कोणतीही प्रलंबित डिलिव्हरी नाही.' },

  // ── Deliveries ────────────────────────────────────────────────────────────────
  tab_pending:     { en: 'Pending',      mr: 'प्रलंबित' },
  tab_daily:       { en: 'Daily Orders', mr: 'दैनंदिन ऑर्डर' },
  tab_completed:   { en: 'Completed',    mr: 'पूर्ण झाले' },
  tab_preorder:    { en: 'Pre-orders',   mr: 'आगाऊ ऑर्डर' },
  mark_delivered:  { en: 'Mark Delivered', mr: 'डिलिव्हर म्हणून नोंदवा' },
  jars_delivered:  { en: 'Jars Delivered', mr: 'डिलिव्हर केलेले जार' },
  payment_mode:    { en: 'Payment Mode', mr: 'पेमेंट पद्धत' },
  amount_collected: { en: 'Amount Collected (₹)', mr: 'गोळा केलेली रक्कम (₹)' },
  pay_later_selected: { en: 'Pay Later selected', mr: 'नंतर द्या निवडले' },
  pay_later_note:  { en: "will be added to customer's pending balance", mr: 'ग्राहकाच्या थकबाकीत जोडले जाईल' },
  no_orders:       { en: 'No orders in this category', mr: 'या विभागात कोणते ऑर्डर नाहीत' },
  delivery_done:   { en: 'Delivery Recorded! 🎉', mr: 'डिलिव्हरी नोंदवली! 🎉' },
  jars_delivered_to: { en: 'jars delivered to', mr: 'जार डिलिव्हर केले' },
  order_no:        { en: 'Order #', mr: 'ऑर्डर #' },

  // ── Customers ─────────────────────────────────────────────────────────────────
  customers_title: { en: 'Customers',    mr: 'ग्राहक' },
  customer_profile:{ en: 'Customer Profile', mr: 'ग्राहक प्रोफाइल' },
  jar_rate:        { en: 'Jar Rate',     mr: 'जार दर' },
  pending_balance: { en: 'Pending Balance', mr: 'थकबाकी' },
  deliver_jars:    { en: 'Deliver Jars', mr: 'जार द्या' },
  no_customers:    { en: 'No customers found', mr: 'ग्राहक सापडले नाहीत' },
  copy_phone:      { en: 'Copied!',      mr: 'कॉपी केले!' },
  due:             { en: 'due',          mr: 'थकबाकी' },
  per_jar:         { en: '/jar',         mr: '/जार' },

  // ── Casual Deliveries ─────────────────────────────────────────────────────────
  casual_title:    { en: 'Casual Deliveries', mr: 'सामान्य डिलिव्हरी' },
  casual_subtitle: { en: 'Jars given to walk-in / non-registered persons', mr: 'नोंदणी नसलेल्या व्यक्तींना दिलेले जार' },
  log_delivery:    { en: 'Log Delivery', mr: 'नोंद करा' },
  record_casual:   { en: 'Record Casual Jar Delivery', mr: 'सामान्य जार डिलिव्हरी नोंदवा' },
  casual_info:     { en: 'Use this form to log jars given to walk-in or casual customers who are not registered in the system.', mr: 'नोंदणी नसलेल्या व्यक्तींना दिलेल्या जारांची नोंद करण्यासाठी हा फॉर्म वापरा.' },
  person_name:     { en: 'Person Name',  mr: 'व्यक्तीचे नाव' },
  phone:           { en: 'Phone',        mr: 'फोन' },
  optional:        { en: '(optional)',   mr: '(ऐच्छिक)' },
  jars:            { en: 'Jars',         mr: 'जार' },
  total_records:   { en: 'Total Records', mr: 'एकूण नोंदी' },
  total_jars:      { en: 'Total Jars',   mr: 'एकूण जार' },
  total_collected: { en: 'Total Collected', mr: 'एकूण गोळा' },
  no_casual:       { en: 'No casual deliveries yet', mr: 'अद्याप कोणतीही सामान्य डिलिव्हरी नाही' },
  no_casual_hint:  { en: 'Tap "Log Delivery" to record a jar given to a walk-in person.', mr: '"नोंद करा" दाबा आणि जार डिलिव्हरी नोंदवा.' },
  unknown_person:  { en: 'Unknown Person', mr: 'अज्ञात व्यक्ती' },
  save_record:     { en: 'Save Record',  mr: 'नोंद जतन करा' },

  // ── Inventory ─────────────────────────────────────────────────────────────────
  inventory_title: { en: 'My Inventory', mr: 'माझा साठा' },
  assigned_jars:   { en: 'Assigned Jars', mr: 'नियुक्त जार' },
  empty_collected: { en: 'Empties Collected', mr: 'रिकामे गोळा' },
  return_empties:  { en: 'Return Empties', mr: 'रिकामे परत करा' },
  report_damaged:  { en: 'Report Damaged', mr: 'नुकसान नोंदवा' },
  submit_cash:     { en: 'Submit Cash',  mr: 'रोख जमा करा' },
  cash_submitted:  { en: 'Cash Submitted', mr: 'रोख जमा' },
  no_inventory:    { en: 'No inventory assigned yet', mr: 'अद्याप साठा नियुक्त नाही' },
  activity_log:    { en: 'Activity Log', mr: 'क्रियाकलाप नोंद' },
  no_logs:         { en: 'No activity yet', mr: 'अद्याप कोणतीही क्रियाकलाप नाही' },
} as const;

export type TranslationKey = keyof typeof translations;

export const t = (key: TranslationKey, lang: Lang): string =>
  translations[key][lang];
