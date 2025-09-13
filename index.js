// index.js
const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// ✅ MongoDB setup
const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("⚠️ MONGODB_URI is not set in .env file");
}
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

let usersCollection, leaderboardCollection;

async function connectDB() {
  try {
    await client.connect();
    const db = client.db("ai_mentor_db"); // change DB name if you want
    usersCollection = db.collection("users_data");
    leaderboardCollection = db.collection("leaderboard");
    console.log("✅ Connected to MongoDB");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  }
}
connectDB();

// ✅ Helper: Initialize user if not exists
async function initializeUser(email) {
  const existing = await usersCollection.findOne({ email });
  if (!existing) {
    const newUser = {
      email,
      goals: {},
      xp: {},
      heat_map: {},
      max_questions_in_a_day: 0,
      total_questions: 0,
      contribution_streak: 0,
      questions_solved: 0,
      age: null,
      profession: null,
    };
    await usersCollection.insertOne(newUser);
    return newUser;
  }
  return existing;
}

// ✅ Helper: Update leaderboard
async function updateLeaderboard(email) {
  const user = await usersCollection.findOne({ email });
  if (!user) return;

  const total_xp = Object.values(user.xp || {}).reduce((sum, val) => sum + val, 0);

  await leaderboardCollection.updateOne(
    { email },
    {
      $set: {
        email,
        total_xp,
        questions_solved: user.questions_solved || 0,
      },
    },
    { upsert: true }
  );

  // optional: sort leaderboard client-side instead of here
}

// ------------------- ROUTES -------------------

// GET all goals
app.get('/goals/:email', async (req, res) => {
  const { email } = req.params;
  const user = await initializeUser(email);

  if (!user.goals || Object.keys(user.goals).length === 0) {
    return res.status(404).json({ message: 'No goals found for this email.' });
  }

  res.json({
    goals: user.goals,
    user_stats: {
      total_questions: user.total_questions,
      questions_solved: user.questions_solved,
      contribution_streak: user.contribution_streak,
    },
  });
});

// GET specific goal
app.get('/goals/:email/:goalKeyword', async (req, res) => {
  const { email, goalKeyword } = req.params;
  const user = await initializeUser(email);

  if (!user.goals || !user.goals[goalKeyword]) {
    return res.status(404).json({ message: `Goal '${goalKeyword}' not found.` });
  }

  res.json({
    goals: { [goalKeyword]: user.goals[goalKeyword] },
    user_stats: {
      total_questions: user.total_questions,
      questions_solved: user.questions_solved,
      contribution_streak: user.contribution_streak,
    },
  });
});

// PUT create/update goals
app.put('/goals/:email', async (req, res) => {
  const { email } = req.params;
  const { goalKeyword, daily_tasks, roadmap, progress_report, end_goal, difficulty_level, xp } = req.body;

  if (!goalKeyword) return res.status(400).json({ message: 'Missing "goalKeyword".' });

  const user = await initializeUser(email);

  if (!user.goals[goalKeyword]) {
    user.goals[goalKeyword] = {
      daily_tasks: {},
      roadmap: {},
      progress_report: {},
      end_goal: '',
      difficulty_level: 1,
      xp: 0,
    };
  }

  const goal = user.goals[goalKeyword];
  const oldXp = goal.xp || 0;

  // Update fields
  if (end_goal !== undefined) goal.end_goal = end_goal;
  if (difficulty_level !== undefined) goal.difficulty_level = difficulty_level;
  if (xp !== undefined) {
    goal.xp = xp;
    user.xp[goalKeyword] = xp;

    if (xp > oldXp) {
      user.questions_solved = (user.questions_solved || 0) + 1;
      user.total_questions = (user.total_questions || 0) + 1;

      const today = new Date().toISOString().split('T')[0];
      user.heat_map[today] = (user.heat_map[today] || 0) + 1;

      if (user.heat_map[today] > user.max_questions_in_a_day) {
        user.max_questions_in_a_day = user.heat_map[today];
      }
      user.contribution_streak = (user.contribution_streak || 0) + 1;
    }
  }
  if (daily_tasks !== undefined) {
    for (const date in daily_tasks) {
      goal.daily_tasks[date] = { ...(goal.daily_tasks[date] || {}), ...daily_tasks[date] };
    }
  }
  if (roadmap !== undefined) Object.assign(goal.roadmap, roadmap);
  if (progress_report !== undefined) Object.assign(goal.progress_report, progress_report);

  await usersCollection.updateOne({ email }, { $set: user });
  await updateLeaderboard(email);

  res.json({
    message: `Goal '${goalKeyword}' updated successfully.`,
    goal,
    user_stats: {
      total_questions: user.total_questions,
      questions_solved: user.questions_solved,
      contribution_streak: user.contribution_streak,
      max_questions_in_a_day: user.max_questions_in_a_day,
    },
  });
});

// GET user stats
app.get('/user/:email', async (req, res) => {
  const { email } = req.params;
  const user = await initializeUser(email);
  const { goals, ...userStats } = user;
  res.json(userStats);
});

// PUT update user stats
app.put('/user/:email', async (req, res) => {
  const { email } = req.params;
  const updates = req.body;

  const user = await initializeUser(email);
  Object.assign(user, updates);

  await usersCollection.updateOne({ email }, { $set: user });
  await updateLeaderboard(email);

  res.json({ message: `User '${email}' updated successfully.`, userData: user });
});

// GET leaderboard
app.get('/leaderboard', async (req, res) => {
  const leaderboard = await leaderboardCollection.find().sort({ total_xp: -1 }).toArray();
  res.json(leaderboard);
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
