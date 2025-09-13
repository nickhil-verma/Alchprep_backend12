// A Node.js server using Express to manage goal tracking and user stats.
const express = require('express');
const cors = require('cors');
const app = express();
const port = 8080;

app.use(cors());
app.use(express.json());

// In-memory data store.
const database = {};
const leaderboard = [];

// Helper function to initialize a new user's data structure if they don't exist.
const initializeUser = (email) => {
  if (!database[email]) {
    database[email] = {
      goals: {},
      xp: {},
      heat_map: {},
      max_questions_in_a_day: 0,
      total_questions: 0,
      age: null, // Add age
      profession: null // Add profession
    };
  }
};

// Helper function to update the leaderboard whenever a user's XP changes.
const updateLeaderboard = (email) => {
    if (!database[email]) return;
    const total_xp = Object.values(database[email].xp).reduce((sum, points) => sum + points, 0);
    const userIndex = leaderboard.findIndex(user => user.email === email);
    if (userIndex !== -1) {
        leaderboard[userIndex].total_xp = total_xp;
    } else {
        leaderboard.push({ email, total_xp });
    }
    leaderboard.sort((a, b) => b.total_xp - a.total_xp);
};


// --- GOAL-SPECIFIC ROUTES (PUT Route Updated) ---

// GET route to retrieve goals.
app.get('/goals/:email/:goalKeyword?', (req, res) => {
  const { email, goalKeyword } = req.params;
  if (!database[email] || !database[email].goals) {
    return res.status(404).json({ message: 'No goals found for this email.' });
  }
  if (goalKeyword) {
    const goal = database[email].goals[goalKeyword];
    if (goal) {
      return res.status(200).json({ [goalKeyword]: goal });
    } else {
      return res.status(404).json({ message: `Goal '${goalKeyword}' not found.` });
    }
  }
  res.status(200).json({ goals: database[email].goals });
});

// PUT route to create or update goals, now with 'end_goal' field.
app.put('/goals/:email', (req, res) => {
  const { email } = req.params;
  // Destructure the new 'end_goal' field from the request body
  const { goalKeyword, daily_tasks, roadmap, progress_report, end_goal } = req.body;

  if (!goalKeyword) {
    return res.status(400).json({ message: 'Request body must include a "goalKeyword".' });
  }
  initializeUser(email);

  if (!database[email].goals[goalKeyword]) {
    database[email].goals[goalKeyword] = {
      'daily_tasks': {}, 
      'roadmap': {}, 
      'progress_report': {},
      'end_goal': '' // Initialize the end_goal field
    };
  }
  
  // Add logic to update the end_goal
  if (end_goal !== undefined) {
    database[email].goals[goalKeyword].end_goal = end_goal;
  }

  if (daily_tasks !== undefined) {
    for (const date in daily_tasks) {
      if (!database[email].goals[goalKeyword].daily_tasks[date]) {
        database[email].goals[goalKeyword].daily_tasks[date] = {};
      }
      for (const task in daily_tasks[date]) {
         if (!database[email].goals[goalKeyword].daily_tasks[date][task]) {
            database[email].goals[goalKeyword].daily_tasks[date][task] = {};
         }
         Object.assign(database[email].goals[goalKeyword].daily_tasks[date][task], daily_tasks[date][task]);
      }
    }
  }
  if (roadmap !== undefined) {
    Object.assign(database[email].goals[goalKeyword].roadmap, roadmap);
  }
  if (progress_report !== undefined) {
    Object.assign(database[email].goals[goalKeyword].progress_report, progress_report);
  }
  res.status(200).json({
    message: `Goal '${goalKeyword}' updated successfully.`,
    goal: database[email].goals[goalKeyword]
  });
});


// --- NEW ROUTES FOR USER STATS & LEADERBOARD (Unchanged) ---

app.get('/user/:email', (req, res) => {
    const { email } = req.params;
    if (!database[email]) {
        return res.status(404).json({ message: 'User not found.' });
    }
    const { goals, ...userStats } = database[email];
    res.status(200).json(userStats);
});

app.put('/user/:email', (req, res) => {
    const { email } = req.params;
    // Add age and profession to the destructured body
    const { xp, heat_map, max_questions_in_a_day, total_questions, age, profession } = req.body;
    initializeUser(email);
    const user = database[email];
    if (xp !== undefined) {
        Object.assign(user.xp, xp);
        updateLeaderboard(email);
    }
    if (heat_map !== undefined) {
        Object.assign(user.heat_map, heat_map);
    }
    if (max_questions_in_a_day !== undefined) {
        user.max_questions_in_a_day = max_questions_in_a_day;
    }
    if (total_questions !== undefined) {
        user.total_questions = total_questions;
    }
    if (age !== undefined) {
        user.age = age;
    }
    if (profession !== undefined) {
        user.profession = profession;
    }
    res.status(200).json({
        message: `User stats for '${email}' updated successfully.`,
        userData: user
    });
});

app.get('/leaderboard', (req, res) => {
    res.status(200).json(leaderboard);
});


// Start the server.
app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});