export function parseResponse(responseString) {
    const params = new URLSearchParams(responseString);
    const result = {};
    for (const [key, value] of params) {
        result[key] = value;
    }
    return result;
}

// Helper function to get formatted date
export function getFormattedDate() {
    const now = new Date();
    // Next month 1st date
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const year = nextMonth.getFullYear();
    const month = String(nextMonth.getMonth() + 1).padStart(2, '0');
    const day = String(nextMonth.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}
