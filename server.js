const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcrypt');
const session = require('express-session');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware setup
app.use(cors({
    origin: 'http://localhost:3000', // Adjust this to match your frontend URL
    credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));


// Session management
// const MySQLStore = require('express-mysql-session')(session);

//const sessionStore = new MySQLStore({
//    host: '127.0.0.1',
//    user: 'root',
//    password: 'test',
//    database: 'quizapp'
//});

app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60, // 1 hour
        secure: false, // Set to true if using HTTPS
        httpOnly: true,
        sameSite: 'lax' // This allows cookies to be sent across different origins
    }
}));

// Database connection
const db = mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: 'test',
    database: 'quizapp'
});

db.connect(err => {
    if (err) throw err;
    console.log('Connected to MySQL database');
});

// Function to generate a unique key
function generateUniqueKey() {
    return crypto.randomBytes(8).toString('hex');
}

// Middleware to check if the user is an employer
function isEmployerAuthenticated(req, res, next) {
    if (req.session && req.session.userId && !req.session.candidateId) {
        return next();
    } else {
        return res.status(401).json({ error: 'Unauthorized' });
    }
}

// Middleware to check if the user is a candidate
function isCandidateAuthenticated(req, res, next) {
    if (req.session && req.session.candidateId && !req.session.userId) {
        return next();
    } else {
        return res.status(401).json({ error: 'Unauthorized' });
    }
}

// Route to create a new quiz (only for authenticated employers)
// Create a new quiz and send email with the unique link
app.post('/create-quiz', isEmployerAuthenticated, async (req, res) => {
    const { title, description, timeLimit, questions, candidateEmail } = req.body;
    const employerId = req.session.userId;
    const uniqueKey = crypto.randomBytes(8).toString('hex');
    const quizLink = `http://localhost:3000/candidate_login.html`;
    console.log('hello jesse')

    // Insert the quiz into the database
    const insertQuizQuery = `INSERT INTO quizzes (title, description, time_limit, unique_key, employer_id) VALUES (?, ?, ?, ?, ?)`;
    db.query(insertQuizQuery, [title, description, timeLimit, uniqueKey, employerId], (err, result) => {
        if (err) {
            console.error('Failed to insert quiz:', err);
            return res.status(500).json({ error: 'Failed to create quiz' });
        }

        const quizId = result.insertId;

        // Insert the questions into the database
        const questionPromises = questions.map((question, index) => {
            return new Promise((resolve, reject) => {
                console.log(questions)
                const insertQuestionQuery = `INSERT INTO questions (quiz_id, question_text, question_type, correct_answer) VALUES (?, ?, ?, ?)`;
                db.query(insertQuestionQuery, [quizId, question.text, question.type, JSON.stringify(question.correctAnswers)], (err, questionResult) => {
                    if (err) {
                        console.error('Failed to insert question:', err);
                        return reject(err);
                    }

                    const questionId = questionResult.insertId;

                    // Insert the options for each question if applicable
                    if (question.options && question.options.length > 0) {
                        const optionPromises = question.options.map((option, optionIndex) => {
                            return new Promise((resolveOption, rejectOption) => {
                                const isCorrect = question.correctAnswers.includes(option) ? 1 : 0;
                                const insertOptionQuery = `INSERT INTO answer_options (question_id, option_text, is_correct) VALUES (?, ?, ?)`;
                                db.query(insertOptionQuery, [questionId, option, isCorrect], (err) => {
                                    if (err) {
                                        console.error('Failed to insert option:', err);
                                        return rejectOption(err);
                                    }
                                    resolveOption();
                                });
                            });
                        });

                        Promise.all(optionPromises).then(resolve).catch(reject);
                    } else {
                        resolve();
                    }
                });
            });
        });

        Promise.all(questionPromises)
            .then(async () => {
                // Send the email with the quiz link
                if (candidateEmail) {
                    const subject = `Invitation to Take a Quiz: ${title}`;
                    const text = `You have been invited to take a quiz. Please use the following link and key to access it:\n\n${quizLink}\n\n${uniqueKey}\n\nGood luck!`;
                    await sendEmail(candidateEmail, subject, text);
                }
                res.json({ message: 'Quiz created successfully', link: quizLink });
            })
            .catch((err) => {
                console.error('Failed to insert questions:', err);
                res.status(500).json({ error: 'Failed to insert questions' });
            });
    });
});

////////////////// QUIZ MANAGEMENT ROUTES (quiz CRUD) ////////////////

// Fetch all quizzes for the logged-in employer
app.get('/quizzes', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const query = `SELECT id, title, description, time_limit, created_at FROM quizzes WHERE employer_id = ?`;
    db.query(query, [req.session.userId], (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

app.delete('/quiz/:id', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const quizId = req.params.id;
    const userId = req.session.userId;

    console.log(`Deleting quiz with ID: ${quizId} for employer ID: ${userId}`);

    db.query("DELETE FROM quiz_invites WHERE quiz_id = ?", [quizId], (err) => {
        if (err) {
            console.error("Failed to delete quiz responses:", err);
            return res.status(500).json({ error: 'Failed to delete quiz' });
        }
        console.log(`Deleted quiz invites for quiz ID: ${quizId}`);
    });

    // Step 1: Delete responses from quiz_responses
    db.query("DELETE FROM quiz_responses WHERE quiz_id = ?", [quizId], (err) => {
        if (err) {
            console.error("Failed to delete quiz responses:", err);
            return res.status(500).json({ error: 'Failed to delete quiz' });
        }
        console.log(`Deleted quiz responses for quiz ID: ${quizId}`);

        // Step 2: Delete questions and associated answer options
        db.query(
            "DELETE answer_options FROM answer_options INNER JOIN questions ON answer_options.question_id = questions.id WHERE questions.quiz_id = ?",
            [quizId],
            (err) => {
                if (err) {
                    console.error("Failed to delete answer options:", err);
                    return res.status(500).json({ error: 'Failed to delete quiz' });
                }

                db.query("DELETE FROM questions WHERE quiz_id = ?", [quizId], (err) => {
                    if (err) {
                        console.error("Failed to delete questions:", err);
                        return res.status(500).json({ error: 'Failed to delete quiz' });
                    }

                    // Step 3: Finally, delete the quiz itself
                    db.query(
                        "DELETE FROM quizzes WHERE id = ? AND employer_id = ?",
                        [quizId, userId],
                        (err, result) => {
                            if (err) {
                                console.error("Failed to delete quiz:", err);
                                return res.status(500).json({ error: 'Failed to delete quiz' });
                            }
                            if (result.affectedRows === 0) {
                                return res.status(404).json({ error: 'Quiz not found' });
                            }
                            console.log(`Quiz with ID ${quizId} deleted successfully`);
                            res.json({ message: 'Quiz deleted successfully' });
                        }
                    );
                });
            }
        );
    });
});


app.get('/quiz-results/:email', isEmployerAuthenticated, (req, res) => {
    const employerId = req.session.userId;
    const candidateEmail = req.params.email;

    const query = `
        SELECT 
            q.title AS quiz_title,
            qs.id AS question_id,
            qs.question_text,
            qr.answers AS candidate_answers,
            ao.option_text AS correct_answer,
            ao.is_correct,
            ROW_NUMBER() OVER (PARTITION BY qs.quiz_id ORDER BY qs.id) - 1 AS question_index
        FROM quiz_responses qr
        JOIN quizzes q ON qr.quiz_id = q.id
        JOIN questions qs ON qs.quiz_id = q.id
        JOIN answer_options ao ON ao.question_id = qs.id
        JOIN candidates c ON qr.candidate_id = c.id
        WHERE q.employer_id = ? AND c.email = ? AND ao.is_correct = 1
        ORDER BY q.title, qs.id;
    `;

    db.query(query, [employerId, candidateEmail], (err, results) => {
        if (err) {
            console.error("Failed to fetch quiz results:", err);
            return res.status(500).json({ error: 'Failed to fetch quiz results' });
        }

        const evaluatedResults = results.map(result => {
            let candidateAnswers;
            try {
                // Parse the answers JSON
                candidateAnswers = typeof result.candidate_answers === 'string'
                    ? JSON.parse(result.candidate_answers || '[]')
                    : result.candidate_answers || [];
            } catch (error) {
                console.error("Failed to parse candidate answers:", error);
                candidateAnswers = [];
            }

            // Match the question using question_index
            const selectedOption = candidateAnswers.find(
                ans => ans.questionIndex === result.question_index
            )?.selectedOptions[0]; // Extract the selected option

            return {
                quiz_title: result.quiz_title,
                question_id: result.question_id,
                question_text: result.question_text,
                candidate_answer: selectedOption || 'No Answer',
                correct_answer: result.correct_answer,
                is_correct: selectedOption === result.correct_answer,
            };
        });

        res.json(evaluatedResults);
    });
});





// Fetch details of a specific quiz for editing
app.get('/quiz/:id', isEmployerAuthenticated, (req, res) => {
    const quizId = req.params.id;

    // Query to fetch quiz details
    const quizQuery = `
        SELECT id, title, description, time_limit
        FROM quizzes
        WHERE id = ? AND employer_id = ?`;

    // Query to fetch questions and their options
    const questionsQuery = `
        SELECT q.id AS question_id, q.question_text, q.question_type,
               ao.id AS option_id, ao.option_text, ao.is_correct
        FROM questions q
        LEFT JOIN answer_options ao ON q.id = ao.question_id
        WHERE q.quiz_id = ?
        ORDER BY q.id, ao.id`;

    db.query(quizQuery, [quizId, req.session.userId], (quizErr, quizResults) => {
        if (quizErr || quizResults.length === 0) {
            return res.status(404).json({ error: 'Quiz not found' });
        }

        const quiz = quizResults[0];
        db.query(questionsQuery, [quizId], (questionsErr, questionsResults) => {
            if (questionsErr) {
                return res.status(500).json({ error: 'Failed to fetch quiz questions' });
            }

            const questions = {};
            questionsResults.forEach(row => {
                if (!questions[row.question_id]) {
                    questions[row.question_id] = {
                        id: row.question_id,
                        text: row.question_text,
                        type: row.question_type,
                        options: []
                    };
                }
                if (row.option_id) {
                    questions[row.question_id].options.push({
                        id: row.option_id,
                        text: row.option_text,
                        isCorrect: !!row.is_correct
                    });
                }
            });

            quiz.questions = Object.values(questions);
            res.json(quiz);
        });
    });
});

app.put('/quiz/:id', isEmployerAuthenticated, (req, res) => {
    const quizId = req.params.id;
    const { title, description, timeLimit, questions } = req.body;

    // Update quiz details
    const updateQuizQuery = `
        UPDATE quizzes
        SET title = ?, description = ?, time_limit = ?
        WHERE id = ? AND employer_id = ?`;

    db.query(updateQuizQuery, [title, description, timeLimit, quizId, req.session.userId], (quizErr) => {
        if (quizErr) {
            return res.status(500).json({ error: 'Failed to update quiz' });
        }

        // Delete answer options associated with the quiz's questions
        const deleteOptionsQuery = `
            DELETE ao
            FROM answer_options ao
            JOIN questions q ON ao.question_id = q.id
            WHERE q.quiz_id = ?`;

        db.query(deleteOptionsQuery, [quizId], (deleteOptionsErr) => {
            if (deleteOptionsErr) {
                return res.status(500).json({ error: 'Failed to clear old quiz options' });
            }

            // Delete existing questions
            const deleteQuestionsQuery = `DELETE FROM questions WHERE quiz_id = ?`;
            db.query(deleteQuestionsQuery, [quizId], (deleteQuestionsErr) => {
                if (deleteQuestionsErr) {
                    return res.status(500).json({ error: 'Failed to clear old quiz data' });
                }

                // Insert updated questions and options
                const questionPromises = questions.map(question => {
                    return new Promise((resolve, reject) => {
                        const insertQuestionQuery = `
                            INSERT INTO questions (quiz_id, question_text, question_type)
                            VALUES (?, ?, ?)`;

                        db.query(insertQuestionQuery, [quizId, question.text, question.type], (questionErr, questionResult) => {
                            if (questionErr) {
                                return reject(questionErr);
                            }

                            const questionId = questionResult.insertId;

                            // Insert options for each question
                            if (question.options && question.options.length > 0) {
                                const optionPromises = question.options.map(option => {
                                    return new Promise((resolveOption, rejectOption) => {
                                        const insertOptionQuery = `
                                            INSERT INTO answer_options (question_id, option_text, is_correct)
                                            VALUES (?, ?, ?)`;

                                        db.query(insertOptionQuery, [questionId, option.text, option.isCorrect ? 1 : 0], (optionErr) => {
                                            if (optionErr) return rejectOption(optionErr);
                                            resolveOption();
                                        });
                                    });
                                });

                                Promise.all(optionPromises).then(resolve).catch(reject);
                            } else {
                                resolve();
                            }
                        });
                    });
                });

                Promise.all(questionPromises)
                    .then(() => res.json({ message: 'Quiz updated successfully' }))
                    .catch(err => res.status(500).json({ error: 'Failed to update questions/options' }));
            });
        });
    });
});

// Route to resend a created quiz to a new candidate
app.post('/send-quiz', isEmployerAuthenticated, (req, res) => {
    const { quizId, candidateEmail } = req.body;

    if (!quizId || !candidateEmail) {
        return res.status(400).json({ error: 'Quiz ID and candidate email are required.' });
    }

    // Fetch the original unique key from the quizzes table
    const fetchKeyQuery = `SELECT unique_key FROM quizzes WHERE id = ?`;

    db.query(fetchKeyQuery, [quizId], (fetchErr, fetchResults) => {
        if (fetchErr) {
            console.error('Error fetching unique key:', fetchErr);
            return res.status(500).json({ error: 'Failed to fetch quiz key.' });
        }

        if (fetchResults.length === 0) {
            return res.status(404).json({ error: 'Quiz not found.' });
        }

        const uniqueKey = fetchResults[0].unique_key;

        // Insert the invite into the quiz_invites table for tracking
        const inviteQuery = `
            INSERT INTO quiz_invites (quiz_id, candidate_email, unique_key)
            VALUES (?, ?, ?)`;

        db.query(inviteQuery, [quizId, candidateEmail, uniqueKey], async (inviteErr) => {
            if (inviteErr) {
                console.error('Error saving quiz invite:', inviteErr);
                return res.status(500).json({ error: 'Failed to send quiz invite.' });
            }

            // Send the email to the candidate
            try {
                const transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: {
                        user: 'jessesoliman@gmail.com', // Replace with your email
                        pass: 'jdmqdfnjoqmhwegu' // Replace with your app password
                    }
                });

                const quizLink = `http://localhost:3000/unlock_quiz.html?key=${uniqueKey}`;
                const mailOptions = {
                    from: '"Quiz Portal" <jessesoliman@gmail.com>',
                    to: candidateEmail,
                    subject: 'You Have Been Invited to Take a Quiz',
                    text: `Hello,\n\nYou have been invited to take a quiz. Please use the following link to access it:\n\n${quizLink}\n\nGood luck!\nQuiz Portal`,
                };

                await transporter.sendMail(mailOptions);
                console.log(`Quiz invite sent to ${candidateEmail}`);

                res.json({ message: 'Quiz sent successfully!' });
            } catch (emailErr) {
                console.error('Failed to send email:', emailErr);
                res.status(500).json({ error: 'Quiz invite saved, but failed to send email.' });
            }
        });
    });
});


////////////////// EMPLOYER MANAGEMENT ROUTES ////////////////

// Route to register a new employer
app.post('/register', async (req, res) => {
    const { name, email, password } = req.body;

    // Check if all fields are provided
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if the email is already registered
    const checkQuery = 'SELECT * FROM employers WHERE email = ?';
    db.query(checkQuery, [email], async (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }

        if (results.length > 0) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        try {
            // Hash the password
            const hashedPassword = await bcrypt.hash(password, 10);

            // Insert the new employer into the database
            const insertQuery = 'INSERT INTO employers (name, email, password) VALUES (?, ?, ?)';
            db.query(insertQuery, [name, email, hashedPassword], (err, result) => {
                if (err) {
                    return res.status(500).json({ error: 'Database error' });
                }
                res.status(201).json({ message: 'Employer registered successfully' });
            });
        } catch (error) {
            res.status(500).json({ error: 'Error registering employer' });
        }
    });
});

// Route to check if a user is authenticated and return profile information
app.get('/check-auth', (req, res) => {
    if (req.session && req.session.userId) {
        const query = `SELECT name, email FROM employers WHERE id = ?`;
        db.query(query, [req.session.userId], (err, results) => {
            if (err || results.length === 0) {
                return res.status(500).json({ error: 'Failed to fetch profile data' });
            }
            const { name, email } = results[0];
            res.status(200).json({ name, email });
        });
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    

    const query = `SELECT * FROM employers WHERE email = ?`;
    db.query(query, [email], async (err, results) => {
        if (err || results.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const match = await bcrypt.compare(password, results[0].password);
        if (!match) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Set the session
        req.session.userId = results[0].id;
        req.session.save((err) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to save session' });
            }
            console.log("Session saved:", req.session);
            res.json({ message: 'Logged in successfully' });
        });
    });
});

// Update Profile
app.post('/update-profile', (req, res) => {
    const { name } = req.body;
    const userId = req.session.userId;
    const query = `UPDATE employers SET name = ? WHERE id = ?`;

    db.query(query, [name, userId], (err) => {
        if (err) return res.status(500).json({ error: 'Update failed' });
        res.json({ message: 'Profile updated' });
    });
});

// Logout
app.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ message: 'Logged out' });
});

////////////////// EMAIL CONFIGURATION ROUTES ////////////////

// Nodemailer transporter setup
const transporter = nodemailer.createTransport({
    service: 'gmail', // Use your email service provider (e.g., Gmail, Outlook)
    auth: {
        user: 'jessesoliman@gmail.com', // Replace with your email
        pass: 'jdmqdfnjoqmhwegu'   // Replace with your email password or app password
    }
});

// Function to send email
async function sendEmail(to, subject, text) {
    try {
        await transporter.sendMail({
            from: 'jessesoliman@gmail.com',
            to,
            subject,
            text
        });
        console.log('Email sent successfully to', to);
    } catch (error) {
        console.error('Error sending email:', error);
    }
}


////////////////// CANDIDATE ACCOUNT CREATION ROUTES ////////////////

// Candidate Signup
app.post('/candidate-signup', async (req, res) => {
    const { name, email, password } = req.body;

    const passwordHash = await bcrypt.hash(password, 10);
    const insertQuery = `INSERT INTO candidates (name, email, password_hash) VALUES (?, ?, ?)`;

    db.query(insertQuery, [name, email, passwordHash], (err) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ error: 'Email already in use.' });
            }
            return res.status(500).json({ error: 'Failed to create account.' });
        }
        res.status(201).json({ message: 'Account created successfully!' });
    });
});

// Candidate Login
app.post('/candidate-login', (req, res) => {
    const { email, password } = req.body;

    const query = `SELECT id, password_hash FROM candidates WHERE email = ?`;
    db.query(query, [email], async (err, results) => {
        if (err || results.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const candidate = results[0];
        const passwordMatch = await bcrypt.compare(password, candidate.password_hash);

        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        // Save candidate session
        req.session.candidateId = candidate.id;
        req.session.isCandidate = true; // Flag to indicate candidate session
        req.session.save((saveErr) => {
            if (saveErr) {
                console.error('Failed to save session:', saveErr);
                return res.status(500).json({ error: 'Failed to log in.' });
            }
            res.json({ message: 'Login successful!' });
        });
    });
});

// Candidate auth
app.get('/check-candidate-auth', (req, res) => {
    if (req.session && req.session.candidateId) {
        res.status(200).json({ authenticated: true });
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
});


////////////////// CANDIDATE QUIZ TAKING ROUTES ////////////////

// Quiz Key Validation
app.post('/verify-quiz-key', isCandidateAuthenticated, (req, res) => {
    const { quizKey } = req.body;

    const query = `SELECT id, title, description FROM quizzes WHERE unique_key = ?`;
    db.query(query, [quizKey], (err, results) => {
        if (err || results.length === 0) {
            return res.status(404).json({ error: 'Invalid quiz key.' });
        }

        const quiz = results[0];
        res.json(quiz);
    });
});

// Fetch Quiz Data
app.get('/take-quiz/:key', isCandidateAuthenticated, (req, res) => {
    const quizKey = req.params.key;

    const quizQuery = `SELECT id, title, description FROM quizzes WHERE unique_key = ?`;
    const questionsQuery = `
        SELECT q.id AS question_id, q.question_text, q.question_type,
               ao.option_text
        FROM questions q
        LEFT JOIN answer_options ao ON q.id = ao.question_id
        WHERE q.quiz_id = ?
        ORDER BY q.id, ao.id`;

    db.query(quizQuery, [quizKey], (quizErr, quizResults) => {
        if (quizErr || quizResults.length === 0) {
            return res.status(404).json({ error: 'Quiz not found.' });
        }

        const quiz = quizResults[0];
        db.query(questionsQuery, [quiz.id], (questionsErr, questionsResults) => {
            if (questionsErr) {
                return res.status(500).json({ error: 'Failed to load quiz questions.' });
            }

            const questions = {};
            questionsResults.forEach(row => {
                if (!questions[row.question_id]) {
                    questions[row.question_id] = {
                        text: row.question_text,
                        type: row.question_type,
                        options: []
                    };
                }
                if (row.option_text) {
                    questions[row.question_id].options.push({ text: row.option_text });
                }
            });

            quiz.questions = Object.values(questions);
            res.json(quiz);
        });
    });
});

// Submit Quiz Responses
app.post('/submit-quiz', isCandidateAuthenticated, (req, res) => {
    const { quizKey, answers } = req.body;

    if (!quizKey || !answers) {
        return res.status(400).json({ error: 'Quiz key and answers are required.' });
    }

    console.log('Quiz Key received:', quizKey);

    // Fetch quiz and questions
    const quizQuery = `
        SELECT 
            quizzes.id AS quiz_id, quizzes.title, quizzes.start_time, 
            employers.email AS employer_email, employers.name AS employer_name,
            questions.id AS question_id, questions.correct_answer
        FROM quizzes
        JOIN employers ON quizzes.employer_id = employers.id
        JOIN questions ON quizzes.id = questions.quiz_id
        WHERE quizzes.unique_key = ?`;

    db.query(quizQuery, [quizKey], async (quizErr, quizResults) => {
        if (quizErr) {
            console.error('Database error while fetching quiz:', quizErr);
            return res.status(500).json({ error: 'Database error while fetching quiz.' });
        }

        if (!quizResults || quizResults.length === 0) {
            return res.status(404).json({ error: 'Quiz not found.' });
        }

        console.log('Quiz fetched successfully.');

        const quizId = quizResults[0].quiz_id;
        const candidateId = req.session.candidateId;
        const employerEmail = quizResults[0].employer_email;
        const employerName = quizResults[0].employer_name;
        const quizTitle = quizResults[0].title;

        // Map question IDs to correct answers
        const correctAnswersMap = quizResults.reduce((map, question) => {
            map[question.question_id] = (question.correct_answer || '[]');
            return map;
        }, {});

        // Calculate score
        let score = 0;
        answers.forEach(({ questionIndex, selectedOptions }) => {
            const questionId = quizResults[questionIndex]?.question_id; // Adjust index if needed
            const correctAnswer = correctAnswersMap[questionId];
            console.log(JSON.stringify(selectedOptions.sort()), JSON.stringify(correctAnswer.sort()))

            if (
                Array.isArray(correctAnswer) &&
                Array.isArray(selectedOptions) &&
                JSON.stringify(selectedOptions.sort()) === JSON.stringify(correctAnswer.sort())
            ) {
                score++;
            }
        });

        console.log('Calculated score:', score);

        // Calculate time taken
        const startTime = quizResults[0].start_time;
        const timeTaken = startTime ? Math.floor((Date.now() - new Date(startTime)) / 1000) : null;

        // Insert response into database
        const insertResponseQuery = `
            INSERT INTO quiz_responses (quiz_id, candidate_id, answers, score, time_taken, completed_at)
            VALUES (?, ?, ?, ?, ?, NOW())`;

        db.query(insertResponseQuery, [quizId, candidateId, JSON.stringify(answers), score, timeTaken], async (responseErr) => {
            if (responseErr) {
                console.error('Error saving quiz response:', responseErr);
                return res.status(500).json({ error: 'Failed to save quiz response.' });
            }

            console.log('Quiz response saved successfully.');

            // Notify employer via email
            try {
                const transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: {
                        user: 'jessesoliman@gmail.com', // Replace with your email
                        pass: 'jdmqdfnjoqmhwegu' // Replace with your app password
                    }
                });

                const mailOptions = {
                    from: '"Quiz Portal" <your-email@example.com>',
                    to: employerEmail,
                    subject: `Quiz Completed: ${quizTitle}`,
                    text: `Hello ${employerName},\n\nA candidate has completed the quiz "${quizTitle}" with a score of ${score}.\n\nThank you,\nQuiz Portal`,
                    html: `
                        <p>Hello ${employerName},</p>
                        <p>A candidate has completed the quiz "<strong>${quizTitle}</strong>" with a score of <strong>${score}</strong>.</p>
                        <p>Thank you,<br>Quiz Portal</p>
                    `
                };

                await transporter.sendMail(mailOptions);
                console.log(`Email sent to employer: ${employerEmail}`);

                res.json({ message: 'Quiz submitted successfully!', score, timeTaken });
            } catch (emailErr) {
                console.error('Failed to send email:', emailErr);
                res.status(500).json({ error: 'Quiz response saved, but failed to notify employer.' });
            }
        });
    });
});

////////////////// EMPLOYER ANALYTICS ROUTES ////////////////

// Fetch Quiz Results for Employers
app.get('/quiz-results/:quizId', isEmployerAuthenticated, (req, res) => {
    const quizId = req.params.quizId;

    const quizQuery = `
        SELECT quizzes.title, quizzes.description, employers.id AS employer_id
        FROM quizzes
        JOIN employers ON quizzes.employer_id = employers.id
        WHERE quizzes.id = ?`;

    const responsesQuery = `
        SELECT qr.candidate_id, candidates.name AS candidate_name, qr.score, qr.time_taken, qr.answers, qr.completed_at
        FROM quiz_responses qr
        JOIN candidates ON qr.candidate_id = candidates.id
        WHERE qr.quiz_id = ?
        ORDER BY qr.completed_at DESC`;

    db.query(quizQuery, [quizId], (quizErr, quizResults) => {
        if (quizErr || quizResults.length === 0) {
            return res.status(404).json({ error: 'Quiz not found.' });
        }

        const quiz = quizResults[0];
        console.log(quiz)

        if (quiz.employer_id !== req.session.userId) {
            return res.status(403).json({ error: 'Unauthorized access to quiz results.' });
        }

        db.query(responsesQuery, [quizId], (responsesErr, responsesResults) => {
            if (responsesErr) {
                return res.status(500).json({ error: 'Failed to fetch quiz responses.' });
            }

            res.json({
                quiz: {
                    title: quiz.title,
                    description: quiz.description
                },
                responses: responsesResults
            });
        });
    });
});

// Fetch Analytics Data
app.get('/quiz-analytics', isEmployerAuthenticated, (req, res) => {
    const employerId = req.session.userId;

    if (!employerId) {
        return res.status(401).json({ error: 'Unauthorized access.' });
    }

    // Query to fetch analytics for all quizzes created by the employer
    const analyticsQuery = `
        SELECT 
            quizzes.id AS quiz_id,
            quizzes.title AS quiz_title,
            COUNT(quiz_responses.id) AS total_responses,
            COALESCE(AVG(quiz_responses.score), 0) AS average_score,
            COALESCE(MAX(quiz_responses.score), 0) AS highest_score,
            COALESCE(MIN(quiz_responses.score), 0) AS lowest_score,
            COALESCE(AVG(quiz_responses.time_taken), 0) AS average_time
        FROM quizzes
        LEFT JOIN quiz_responses ON quizzes.id = quiz_responses.quiz_id
        WHERE quizzes.employer_id = ?
        GROUP BY quizzes.id
        ORDER BY quizzes.title;`;

    db.query(analyticsQuery, [employerId], (err, results) => {
        if (err) {
            console.error('Error fetching quiz analytics:', err);
            return res.status(500).json({ error: 'Failed to fetch analytics data.' });
        }
        res.json(results);
    });
});

// Fetch Quiz Responses
app.get('/quiz-responses/:quizId', isEmployerAuthenticated, (req, res) => {
    const { quizId } = req.params;

    if (!quizId) {
        return res.status(400).json({ error: 'Quiz ID is required.' });
    }

    const query = `
        SELECT 
            candidates.id AS candidate_id,
            candidates.email AS candidate_email,
            quiz_responses.score,
            quiz_responses.time_taken,
            quiz_responses.completed_at
        FROM quiz_responses
        JOIN candidates ON quiz_responses.candidate_id = candidates.id
        WHERE quiz_responses.quiz_id = ?
        ORDER BY quiz_responses.score DESC, quiz_responses.time_taken ASC`;

    db.query(query, [quizId], (err, results) => {
        if (err) {
            console.error('Error fetching quiz responses:', err);
            return res.status(500).json({ error: 'Failed to fetch quiz responses.' });
        }
        res.json(results);
    });
});

app.get('/quiz-results/:email', isEmployerAuthenticated, (req, res) => {
    const employerId = req.session.userId;
    const candidateEmail = req.params.email;

    const query = `
        SELECT q.title AS quiz_title, c.name AS candidate_name, qr.answers, qr.completed_at
        FROM quiz_responses qr
        JOIN quizzes q ON qr.quiz_id = q.id
        JOIN candidates c ON qr.candidate_id = c.id
        WHERE q.employer_id = ? AND c.email = ?
        ORDER BY q.title, qr.completed_at
    `;

    db.query(query, [employerId, candidateEmail], (err, results) => {
        if (err) {
            console.error("Failed to fetch quiz results:", err);
            return res.status(500).json({ error: 'Failed to fetch quiz results' });
        }
        res.json(results);
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
