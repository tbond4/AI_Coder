document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const quizId = params.get('quizId');

    if (!quizId) {
        alert('Quiz ID is missing.');
        window.location.href = 'quiz_analytics.html';
        return;
    }

    try {
        const response = await fetch(`/quiz-responses/${quizId}`, { credentials: 'include' });

        if (!response.ok) {
            alert('Failed to load quiz responses.');
            return;
        }

        const responses = await response.json();
        populateResponsesTable(responses);
    } catch (error) {
        console.error('Error fetching quiz responses:', error);
        alert('An error occurred while loading the responses.');
    }
});

function populateResponsesTable(data) {
    const tableBody = document.getElementById('responsesTable');
    tableBody.innerHTML = '';

    if (data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4">No responses found for this quiz.</td></tr>';
        return;
    }

    data.forEach(response => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${response.candidate_email}</td>
            <td>${response.score}</td>
            <td>${(response.time_taken / 60)}</td>
            <td>${new Date(response.completed_at).toLocaleString()}</td>
        `;
        tableBody.appendChild(row);
    });
}
