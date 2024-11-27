document.addEventListener('DOMContentLoaded', async () => {
    await loadQuizzes();
});

async function loadQuizzes() {
    const response = await fetch('/quizzes', { credentials: 'include' });
    const quizzes = await response.json();

    const container = document.getElementById('quizTable');
    container.innerHTML = '';

    quizzes.forEach(quiz => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${quiz.title}</td>
            <td>
                <button class="btn btn-primary" onclick="openSendQuizModal(${quiz.id})">Send</button>
                <button class="btn btn-secondary" onclick="editQuiz(${quiz.id})">Edit</button>
                <button class="btn btn-danger" onclick="deleteQuiz(${quiz.id})">Delete</button>
            </td>
        `;
        container.appendChild(row);
    });
}

function openSendQuizModal(quizId) {
    document.getElementById('selectedQuizId').value = quizId;
    const modal = new bootstrap.Modal(document.getElementById('sendQuizModal'));
    modal.show();
}

document.getElementById('sendQuizForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    const quizId = document.getElementById('selectedQuizId').value;
    const candidateEmail = document.getElementById('candidateEmail').value;

    try {
        const response = await fetch('/send-quiz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quizId, candidateEmail }),
            credentials: 'include'
        });

        if (response.ok) {
            alert('Quiz sent successfully!');
            const modal = bootstrap.Modal.getInstance(document.getElementById('sendQuizModal'));
            modal.hide();
        } else {
            const error = await response.json();
            alert(error.error || 'Failed to send quiz.');
        }
    } catch (error) {
        console.error('Error sending quiz:', error);
        alert('An error occurred while sending the quiz.');
    }
});

// Function to delete a quiz
async function deleteQuiz(quizId) {
    if (!confirm('Are you sure you want to delete this quiz?')) return;

    const response = await fetch(`/quiz/${quizId}`, {
        method: 'DELETE',
        credentials: 'include'
    });

    if (response.ok) {
        alert('Quiz deleted successfully');
        await loadQuizzes();
    } else {
        alert('Failed to delete quiz');
    }
}

function editQuiz(quizId) {
    window.location.href = `edit_quiz_page.html?id=${quizId}`;
}
