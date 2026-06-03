// ---------------------------------------------------------------------------
// Safety content. This is education and encouragement — NOT medical advice.
// The thresholds here reflect standard cardiac-rehab guidance (AACVPR / AHA)
// and post-sternotomy precautions, tailored to this user's medication profile
// (beta-blocker -> use RPE not heart rate; alpha-blocker -> orthostatic care;
// dual antiplatelet -> avoid impact/fall risk; diabetes -> hypoglycemia/foot care).
// ---------------------------------------------------------------------------

/** Symptoms that mean STOP exercising now. */
export const STOP_SIGNS: string[] = [
  'Chest pain, pressure, tightness, or your usual angina',
  'Unusual or sudden shortness of breath',
  'Dizziness, lightheadedness, or feeling faint',
  'Fluttering, racing, or irregular heartbeat (palpitations)',
  'Cold sweat, nausea, or feeling generally unwell',
  'Pain spreading to the jaw, neck, arm, or back',
  'New pain, popping, clicking, or grinding at the breastbone/incision',
  'Pain, swelling, redness, or warmth in one calf',
]

/** What to do if a stop sign appears. */
export const STOP_ACTION =
  'Stop and sit down. If chest pain or pressure does not ease within a few minutes of rest (or you were given nitroglycerin, after using it as directed), call 911. Tell your cardiology team about any symptom that made you stop.'

/** Borg CR10 perceived-exertion anchors used throughout the app. */
export interface RpeAnchor {
  rpe: number
  label: string
  feels: string
  talk: string
}

export const RPE_SCALE: RpeAnchor[] = [
  { rpe: 0, label: 'Rest', feels: 'Sitting still', talk: 'Normal breathing' },
  { rpe: 1, label: 'Very easy', feels: 'Barely working', talk: 'Could sing' },
  { rpe: 2, label: 'Easy', feels: 'Comfortable, could do for hours', talk: 'Could sing' },
  { rpe: 3, label: 'Light', feels: 'Breathing a bit, very manageable', talk: 'Full conversation' },
  { rpe: 4, label: 'Moderate', feels: 'Working, but in control', talk: 'Full sentences' },
  { rpe: 5, label: 'Moderate+', feels: 'Noticeably working', talk: 'Short sentences' },
  { rpe: 6, label: 'Somewhat hard', feels: 'Breathing hard, still steady', talk: 'A short phrase' },
  { rpe: 7, label: 'Hard', feels: 'Challenging, want to slow down', talk: 'A few words only' },
  { rpe: 8, label: 'Very hard', feels: 'Near your limit', talk: 'One word at a time' },
  { rpe: 9, label: 'Extremely hard', feels: 'Almost maximal — avoid', talk: 'Cannot talk' },
  { rpe: 10, label: 'Maximal', feels: 'All-out — do not go here', talk: 'Cannot talk' },
]

/** Why we use RPE instead of heart rate for this user. */
export const RPE_EXPLAINER =
  'You take a beta-blocker (carvedilol), which lowers and "caps" your heart rate. That makes heart-rate targets and most fitness-tracker zones unreliable for you. Instead, judge effort by how you feel and the talk test — it is the method cardiac-rehab teams use for people on these medications.'

/** Pre-workout readiness questions. "Yes" to any = recommend resting today. */
export const READINESS_QUESTIONS: { id: string; q: string }[] = [
  { id: 'chest', q: 'Any chest pain, pressure, or tightness today (even at rest)?' },
  { id: 'breath', q: 'More short of breath than usual today?' },
  { id: 'dizzy', q: 'Feeling dizzy, lightheaded, or faint?' },
  { id: 'heartbeat', q: 'Noticing a racing, fluttering, or irregular heartbeat?' },
  { id: 'incision', q: 'New pain, clicking, or popping at your breastbone or incision?' },
  { id: 'unwell', q: 'Feeling unwell, very tired, or like you might be coming down with something?' },
  { id: 'swelling', q: 'New swelling in your legs, or weight up more than a few pounds since yesterday?' },
]

export const READINESS_FAIL_MESSAGE =
  'Based on what you told me, today is a good day to rest. Take it easy, and let your cardiology team know about anything new — especially chest symptoms, unusual breathlessness, or swelling. You can still log today as a rest day; your streak is safe.'

/** Standing reminders tailored to this user's medications and conditions. */
export const MED_REMINDERS: { title: string; body: string }[] = [
  {
    title: 'Cool down fully — don’t stop suddenly',
    body:
      'Your blood-pressure medications (carvedilol and terazosin) can make you lightheaded if you stop moving abruptly or stand up quickly. Always finish with the cooldown walk, and rise slowly afterward.',
  },
  {
    title: 'Protect your chest while it heals',
    body:
      'Until your surgeon lifts sternal precautions, don’t push, pull, or lift more than a few pounds with your arms, and don’t push up from chairs with your hands. Let your legs do the work. “Keep your movements in the tube” — elbows close to your sides.',
  },
  {
    title: 'Mind your blood sugar',
    body:
      'With diabetes, keep a fast-acting carb (juice or glucose tabs) nearby, especially if it has been a while since you ate. If you feel shaky, sweaty, or confused, stop and treat it.',
  },
  {
    title: 'Avoid falls and hard knocks',
    body:
      'Your blood thinners (aspirin + ticagrelor) make bruising and bleeding easier. We keep impact and balance-risk low for this reason. Use stable surfaces and good shoes.',
  },
  {
    title: 'Check your feet and shoes',
    body:
      'Diabetes can dull foot sensation. Wear supportive shoes and glance at your feet for blisters or sores after exercise.',
  },
  {
    title: 'Pick your moment',
    body:
      'Avoid exercising in the heat of the day, right after a big meal, or when you feel off. Hydrate, and wait about an hour after eating.',
  },
]

export const MEDICAL_DISCLAIMER =
  'HeartStrong is an educational tool to encourage safe activity — it is not medical advice and does not replace your cardiology team or cardiac rehab. Get your doctor’s clearance before starting, and stop and seek care for any warning sign. In an emergency call 911.'
