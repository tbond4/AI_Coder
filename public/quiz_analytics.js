document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('/quiz-analytics', { credentials: 'include' });

        if (!response.ok) {
            alert('Failed to load analytics data. Please try again.');
            return;
        }

        const analyticsData = await response.json();
        console.log(analyticsData);
        populateAnalyticsTable(analyticsData);
    } catch (error) {
        console.error('Error fetching analytics data:', error);
        alert('An error occurred while loading the analytics.');
    }
});

function populateAnalyticsTable(data) {
    const tableBody = document.getElementById('analyticsTable');
    tableBody.innerHTML = '';

    if (data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6">No quizzes found.</td></tr>';
        return;
    }

    data.forEach(quiz => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><a href="quiz_responses.html?quizId=${quiz.quiz_id}">${quiz.quiz_title}</a></td>
            <td>${quiz.total_responses}</td>
            <td>${Number(quiz.average_score)}</td>
            <td>${quiz.highest_score}</td>
            <td>${quiz.lowest_score}</td>
            <td>${(Number(quiz.average_time) / 60)}</td>
        `;
        tableBody.appendChild(row);
    });
}
