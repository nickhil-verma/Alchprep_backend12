const express = require('express');
const cors = require('cors');
const app = express();
const port = 8080;

app.use(cors());
app.use(express.json());

// In-memory data store
const database = {};
const leaderboard = [];

// Helper function to initialize a new user's data structure if they don't exist
const initializeUser = (email) => {
  if (!database[email]) {
    database[email] = {
      goals: {},
      xp: {},
      heat_map: {},
      max_questions_in_a_day: 0,
      total_questions: 0,
      contribution_streak: 0,
      questions_solved: 0,
      age: null,
      profession: null
    };
  }
};

// Helper function to update the leaderboard whenever a user's XP changes
const updateLeaderboard = (email) => {
    if (!database[email]) return;
    const total_xp = Object.values(database[email].xp).reduce((sum, points) => sum + points, 0);
    const userIndex = leaderboard.findIndex(user => user.email === email);
    if (userIndex !== -1) {
        leaderboard[userIndex].total_xp = total_xp;
        leaderboard[userIndex].questions_solved = database[email].questions_solved;
    } else {
        leaderboard.push({ 
            email, 
            total_xp,
            questions_solved: database[email].questions_solved || 0
        });
    }
    leaderboard.sort((a, b) => b.total_xp - a.total_xp);
};

// GET route to retrieve all goals for a user
app.get('/goals/:email', (req, res) => {
  const { email } = req.params;
  initializeUser(email);
  
  if (!database[email].goals || Object.keys(database[email].goals).length === 0) {
    return res.status(404).json({ message: 'No goals found for this email.' });
  }
  
  res.status(200).json({ 
    goals: database[email].goals,
    user_stats: {
      total_questions: database[email].total_questions,
      questions_solved: database[email].questions_solved,
      contribution_streak: database[email].contribution_streak
    }
  });
});

// GET route to retrieve a specific goal
app.get('/goals/:email/:goalKeyword', (req, res) => {
  const { email, goalKeyword } = req.params;
  initializeUser(email);
  
  if (!database[email].goals || !database[email].goals[goalKeyword]) {
    return res.status(404).json({ message: `Goal '${goalKeyword}' not found.` });
  }
  
  res.status(200).json({ 
    goals: { [goalKeyword]: database[email].goals[goalKeyword] },
    user_stats: {
      total_questions: database[email].total_questions,
      questions_solved: database[email].questions_solved,
      contribution_streak: database[email].contribution_streak
    }
  });
});

// PUT route to create or update goals
app.put('/goals/:email', (req, res) => {
  const { email } = req.params;
  const { goalKeyword, daily_tasks, roadmap, progress_report, end_goal, difficulty_level, xp } = req.body;

  if (!goalKeyword) {
    return res.status(400).json({ message: 'Request body must include a "goalKeyword".' });
  }
  
  initializeUser(email);

  // Initialize goal if it doesn't exist
  if (!database[email].goals[goalKeyword]) {
    database[email].goals[goalKeyword] = {
      'daily_tasks': {}, 
      'roadmap': {}, 
      'progress_report': {},
      'end_goal': '',
      'difficulty_level': 1,
      'xp': 0
    };
  }
  
  const goal = database[email].goals[goalKeyword];
  
  // Update end_goal
  if (end_goal !== undefined) {
    goal.end_goal = end_goal;
  }
  
  // Update difficulty_level
  if (difficulty_level !== undefined) {
    goal.difficulty_level = difficulty_level;
  }
  
  // Update XP for this specific goal
  if (xp !== undefined) {
    const oldXp = goal.xp || 0;
    goal.xp = xp;
    
    // Update user's global XP tracking
    if (!database[email].xp[goalKeyword]) {
      database[email].xp[goalKeyword] = 0;
    }
    database[email].xp[goalKeyword] = xp;
    
    // If XP increased, update questions solved and contribution
    if (xp > oldXp) {
      database[email].questions_solved = (database[email].questions_solved || 0) + 1;
      database[email].total_questions = (database[email].total_questions || 0) + 1;
      
      // Update heat map for today
      const today = new Date().toISOString().split('T')[0];
      if (!database[email].heat_map[today]) {
        database[email].heat_map[today] = 0;
      }
      database[email].heat_map[today] += 1;
      
      // Update max questions in a day
      if (database[email].heat_map[today] > database[email].max_questions_in_a_day) {
        database[email].max_questions_in_a_day = database[email].heat_map[today];
      }
      
      // Update contribution streak (simple logic: if solved today, increment streak)
      database[email].contribution_streak = (database[email].contribution_streak || 0) + 1;
    }
    
    updateLeaderboard(email);
  }

  // Update daily tasks
  if (daily_tasks !== undefined) {
    for (const date in daily_tasks) {
      if (!goal.daily_tasks[date]) {
        goal.daily_tasks[date] = {};
      }
      for (const task in daily_tasks[date]) {
         if (!goal.daily_tasks[date][task]) {
            goal.daily_tasks[date][task] = {};
         }
         Object.assign(goal.daily_tasks[date][task], daily_tasks[date][task]);
      }
    }
  }
  
  // Update roadmap
  if (roadmap !== undefined) {
    Object.assign(goal.roadmap, roadmap);
  }
  
  // Update progress report
  if (progress_report !== undefined) {
    Object.assign(goal.progress_report, progress_report);
  }
  
  res.status(200).json({
    message: `Goal '${goalKeyword}' updated successfully.`,
    goal: goal,
    user_stats: {
      total_questions: database[email].total_questions,
      questions_solved: database[email].questions_solved,
      contribution_streak: database[email].contribution_streak,
      max_questions_in_a_day: database[email].max_questions_in_a_day
    }
  });
});

// GET route for user stats
app.get('/user/:email', (req, res) => {
    const { email } = req.params;
    initializeUser(email);
    
    const { goals, ...userStats } = database[email];
    res.status(200).json(userStats);
});

// PUT route for user stats
app.put('/user/:email', (req, res) => {
    const { email } = req.params;
    const { xp, heat_map, max_questions_in_a_day, total_questions, age, profession, questions_solved, contribution_streak } = req.body;
    
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
    if (questions_solved !== undefined) {
        user.questions_solved = questions_solved;
    }
    if (contribution_streak !== undefined) {
        user.contribution_streak = contribution_streak;
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

// GET route for leaderboard
app.get('/leaderboard', (req, res) => {
    res.status(200).json(leaderboard);
});

// Start the server
app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});