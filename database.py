# Generated via ChatGPT

import mysql.connector
from mysql.connector import Error

def create_connection(host_name, user_name, user_password):
    """Establish a connection to the MySQL server."""
    connection = None
    try:
        connection = mysql.connector.connect(
            host=host_name,
            user=user_name,
            passwd=user_password
        )
        print("Connection to MySQL DB successful")
    except Error as e:
        print(f"The error '{e}' occurred")
    return connection

def create_database(connection, query):
    """Create a database in MySQL."""
    cursor = connection.cursor()
    try:
        cursor.execute(query)
        print("Database created successfully")
    except Error as e:
        print(f"The error '{e}' occurred")

def delete_quiz(connection, quiz_id, employer_id):
    cursor = connection.cursor()
    try:
        # Delete associated questions first
        cursor.execute("DELETE FROM questions WHERE quiz_id = %s", (quiz_id,))
        # Now delete the quiz itself
        cursor.execute("DELETE FROM quizzes WHERE id = %s AND employer_id = %s", (quiz_id, employer_id))
        connection.commit()
        return True
    except Error as e:
        print(f"Failed to delete quiz: {e}")
        connection.rollback()
        return False
    finally:
        cursor.close()

def execute_query(connection, query):
    """Execute a single query to create tables."""
    cursor = connection.cursor()
    try:
        cursor.execute(query)
        connection.commit()
        print("Query executed successfully")
    except Error as e:
        print(f"The error '{e}' occurred")

# Establish a connection to the server
connection = create_connection("127.0.0.1", "root", "test")
print('hi')

# Create the database
create_database_query = "CREATE DATABASE IF NOT EXISTS QuizApp"
create_database(connection, create_database_query)

# Connect to the new database
connection.database = "QuizApp"

# Define the SQL queries for table creation

# this table is deprecated
create_employer_table = """
CREATE TABLE IF NOT EXISTS Employer (
    EmployerID INT PRIMARY KEY AUTO_INCREMENT,
    FirstName VARCHAR(50),
    LastName VARCHAR(50),
    Email VARCHAR(100) UNIQUE,
    PasswordHash VARCHAR(255),
    ProfileInfo TEXT,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""

create_employers_table = """
CREATE TABLE employers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(100) UNIQUE,
    password VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""

# this table is deprecated
create_candidate_table = """
CREATE TABLE IF NOT EXISTS Candidate (
    CandidateID INT PRIMARY KEY AUTO_INCREMENT,
    FirstName VARCHAR(50),
    LastName VARCHAR(50),
    Email VARCHAR(100),
    ProfileInfo TEXT
);
"""

create_candidates_table = """
CREATE TABLE IF NOT EXISTS candidates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(100) UNIQUE,
    password_hash VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""

# this table is deprecated
create_quiz_table = """
CREATE TABLE IF NOT EXISTS Quiz (
    QuizID INT PRIMARY KEY AUTO_INCREMENT,
    Title VARCHAR(100),
    Description TEXT,
    CreatedBy INT,
    TimeLimit INT,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (CreatedBy) REFERENCES Employer(EmployerID)
);
"""

create_quizzes_table = """
CREATE TABLE IF NOT EXISTS quizzes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255),
    description TEXT,
    time_limit INT,
    employer_id INT,
    start_time DATETIME DEFAULT NULL,
    unique_key VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employer_id) REFERENCES employers(id)
);
"""

# this table is deprectated
create_question_table = """
CREATE TABLE IF NOT EXISTS Question (
    QuestionID INT PRIMARY KEY AUTO_INCREMENT,
    QuizID INT,
    QuestionText TEXT,
    CorrectAnswer TEXT,
    QuestionType ENUM('True/False', 'Multiple Choice', 'Checkbox', 'Free-form'),
    FOREIGN KEY (QuizID) REFERENCES Quiz(QuizID)
);
"""

create_questions_table = """
CREATE TABLE IF NOT EXISTS questions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    quiz_id INT,
    question_text TEXT,
    question_type VARCHAR(50),
    correct_answer JSON,
    FOREIGN KEY (quiz_id) REFERENCES quizzes(id)
);
"""

# this table is deprecated
create_answer_option_table = """
CREATE TABLE IF NOT EXISTS AnswerOption (
    OptionID INT PRIMARY KEY AUTO_INCREMENT,
    QuestionID INT,
    OptionText TEXT,
    FOREIGN KEY (QuestionID) REFERENCES Question(QuestionID)
);
"""

create_answer_options_table = """
CREATE TABLE IF NOT EXISTS answer_options (
    id INT AUTO_INCREMENT PRIMARY KEY,
    question_id INT,
    option_text VARCHAR(255),
    is_correct BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (question_id) REFERENCES questions(id)
);
"""

create_quiz_link_table = """
CREATE TABLE IF NOT EXISTS QuizLink (
    QuizLinkID INT PRIMARY KEY AUTO_INCREMENT,
    UniqueKey VARCHAR(255) UNIQUE,
    QuizID INT,
    CandidateID INT,
    LinkCreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    LinkExpiresAt TIMESTAMP,
    IsLinkUsed BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (QuizID) REFERENCES quizzes(id),
    FOREIGN KEY (CandidateID) REFERENCES candidates(id)
);
"""

# this table is deprecated
create_quiz_response_table = """
CREATE TABLE IF NOT EXISTS QuizResponse (
    ResponseID INT PRIMARY KEY AUTO_INCREMENT,
    QuizLinkID INT,
    QuestionID INT,
    ResponseText TEXT,
    SubmittedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (QuizLinkID) REFERENCES QuizLink(QuizLinkID),
    FOREIGN KEY (QuestionID) REFERENCES questions(QuestionID)
);
"""

create_quiz_responses_table = """
CREATE TABLE quiz_responses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    quiz_id INT NOT NULL,
    candidate_id INT NOT NULL,
    answers JSON NOT NULL,
    score INT,
    time_taken INT,
    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (quiz_id) REFERENCES quizzes(id),
    FOREIGN KEY (candidate_id) REFERENCES candidates(id)
);
"""

create_quiz_invites_table = """
CREATE TABLE quiz_invites (
    id INT AUTO_INCREMENT PRIMARY KEY,
    quiz_id INT NOT NULL,
    candidate_email VARCHAR(255) NOT NULL,
    unique_key VARCHAR(255) NOT NULL UNIQUE,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (quiz_id) REFERENCES quizzes(id)
);
"""

create_quiz_result_table = """
CREATE TABLE IF NOT EXISTS QuizResult (
    ResultID INT PRIMARY KEY AUTO_INCREMENT,
    QuizLinkID INT,
    TotalScore DECIMAL(5, 2),
    TimeTaken INT,
    CompletedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (QuizLinkID) REFERENCES QuizLink(QuizLinkID)
);
"""

# Execute the queries to create the tables
execute_query(connection, create_employers_table)
execute_query(connection, create_candidates_table)
execute_query(connection, create_quizzes_table)
execute_query(connection, create_questions_table)
execute_query(connection, create_answer_options_table)
execute_query(connection, create_quiz_link_table)
execute_query(connection, create_quiz_responses_table)
execute_query(connection, create_quiz_result_table)
execute_query(connection, create_quiz_invites_table)
