const axios = require('axios');

async function testKelurahan() {
    try {
        console.log('Testing getting Kelurahan...');
        // Assuming there's a valid Kecamatan ID, e.g., 1. If not, it returns empty or error depending on how we handle it.
        // We'll try fetching without parentID first to see if it lists all (though existing logic requires parentID for filtering, it doesn't enforce it for *all* query).
        // Wait, the logic: if (parentID) filter...
        // So if no parentID, it returns ALL kelurahan.

        const response = await axios.get('http://localhost:3000/api/wilayah', {
            params: {
                type: 'kelurahan',
                limit: 5
            }
        });

        console.log('Response status:', response.status);
        console.log('Data:', JSON.stringify(response.data, null, 2));
    } catch (error) {
        if (error.response) {
            console.error('Error status:', error.response.status);
            console.error('Error data:', error.response.data);
        } else {
            console.error('Error:', error.message);
        }
    }
}

testKelurahan();
