/**
 * Primary product FAQ (support page + FAQPage JSON-LD). Keep answers plain text
 * so they can render in <p> and embed in structured data.
 */
export const FITFO_PRODUCT_FAQ: { question: string; answer: string }[] = [
  {
    question: "How does Fitfo turn a workout video into a trackable workout?",
    answer:
      "When you find a workout video in another app, hit the native share button and pick Fitfo from the share sheet. It's as easy as sending the video to a friend, except you're sending it to Fitfo. Our AI reads the video's audio, on-screen text, and exercise cues, then builds a clean, editable workout with sets, reps, and rest periods in about 30 seconds.",
  },
  {
    question: "Does Fitfo work with videos from different apps?",
    answer:
      "Yes. Fitfo supports share-to-import wherever you can share a public fitness video into the share sheet. Anywhere you can hit share on a workout clip, you can send it to Fitfo. You can also create your workouts manually inside the app if you'd rather build them from scratch.",
  },
  {
    question: "Is Fitfo free?",
    answer:
      "Yes, Fitfo is completely free for the first 7 days, with full access to every feature. You don't need to put a card down to start. After the trial, it's $5.99 per month or $39.99 per year, and you'll only be asked for a card when the 7 days end. There's no mandatory paywall up front, so you can use Fitfo like any free app for the first week.",
  },
  {
    question: "How accurate is the AI when it converts a video into a workout?",
    answer:
      "We've reached close to 100% accuracy on cleanly-shot fitness videos. For messier inputs, like bad audio, no captions, or clips with unrelated content mixed in, the import might miss a detail or two. Every workout is fully editable after import. Tap into anything in the app, type your changes, and they save in real time.",
  },
  {
    question: "Can I edit the workout after Fitfo imports it?",
    answer:
      "Yes. Every imported workout opens as editable cards. You can change exercise names, adjust sets and reps, add rest periods, swap movements, or delete what you don't want. You can also add your own notes, cues, and reminders alongside the ones our AI already parsed from the original video. Nothing is locked.",
  },
  {
    question: "Does Fitfo log my sets, reps, and weights during a workout?",
    answer:
      "Yes. Fitfo includes a built-in workout logger. Tap into any session, log your weights and reps as you train, and Fitfo saves everything to your workout history. All your data is stored in the app, so you can see what you lifted, when, and how it's progressing without ever leaving Fitfo.",
  },
  {
    question: "What does the AI coach actually do?",
    answer:
      "Fitfo's AI coach is your workout co-pilot. It's directly trained on muscle building and on the specific workout you're doing. Ask it which muscles an exercise targets, why a movement is programmed a certain way, or how to swap an exercise, and it answers based on your actual session. It's training advice that knows what you're training, not generic AI chat.",
  },
  {
    question: "Can Fitfo analyze my form?",
    answer:
      "No. Fitfo doesn't do video form analysis. The AI's job is to turn workout videos into structured sessions and answer training questions about what you're doing. If you want form feedback, record yourself and ask a coach. We'd rather do two things well than four things poorly.",
  },
  {
    question:
      "How is Fitfo different from Hevy, Strong, Strava, or other workout logger apps?",
    answer:
      "Hevy and Strong are workout loggers where you build the workout yourself. Strava is for cardio and social. Fitfo is built to import a workout directly from a shareable fitness video, then log it. On top of that, our AI coach is trained on your specific workout and on muscle-building principles, so you can ask it questions and it knows exactly what you're doing.",
  },
  {
    question: "Can I schedule workouts for the week?",
    answer:
      "Yes. Fitfo includes a calendar where you can drop imported workouts onto specific days. Schedule a push day for Monday, pull for Wednesday, legs for Friday. You'll get a reminder the day before and the day of, so you never miss a workout again. Once you've completed a session, you can reschedule it directly inside the app.",
  },
  {
    question: "Is Fitfo available on Android?",
    answer:
      "Not yet. Fitfo is currently iOS-only on the App Store. We don't have a waitlist, but if you want to know when Android launches, follow @fitfo.app on Instagram and you'll see it the moment it ships.",
  },
  {
    question: "What kind of workouts work best with Fitfo?",
    answer:
      "Fitfo works best with strength, hypertrophy, HIIT, and core workouts. That includes push days, pull days, full-body sessions, core sessions, and HIIT workouts. Anything with clear exercises, sets, reps, or timed holds (like a 30-second plank) parses cleanly. Circuits and supersets work great too. Dance and yoga flows are harder to parse, but you can always edit after import.",
  },
];
